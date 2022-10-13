import {UtilDocuments} from "./UtilDocuments.js";

class UtilAdvancements {
	static _LevelledEmbeddedDocument = class {
		constructor ({embeddedDocument, level} = {}) {
			if (level == null) throw new Error(`Level must be defined!`);

			this.embeddedDocument = embeddedDocument;
			this.level = level;

			this.advancementId = null;
		}
	};

	/** Background advancements have a minimum level of 0. */
	static LevelledEmbeddedDocument_MinLevel0 = class extends this._LevelledEmbeddedDocument {
		constructor ({level = 0, ...rest}) {
			super({level, ...rest});
		}
	};

	/** Class/subclass advancements have a minimum level of 1. */
	static LevelledEmbeddedDocument_MinLevel1 = class extends this._LevelledEmbeddedDocument {
		constructor ({level = 1, ...rest}) {
			super({level, ...rest});
		}
	};

	static async pAddAdvancementLinks (
		{
			actor,
			parentEmbeddedDocument,
			childLevelledEmbeddedDocuments,
		},
	) {
		childLevelledEmbeddedDocuments = childLevelledEmbeddedDocuments.filter(it => it.embeddedDocument);

		if (!parentEmbeddedDocument || !childLevelledEmbeddedDocuments.length) return;

		// Group by level, to minimize the number of advancement rows added
		const childrenByLevel = {};
		childLevelledEmbeddedDocuments.forEach(child => {
			// if (!child.level) return;
			(childrenByLevel[child.level] = (childrenByLevel[child.level] || [])).push(child);
		});

		// Build a list of all new advancements
		const newAdvancement = Object.keys(childrenByLevel)
			.map(it => Number(it))
			.sort(SortUtil.ascSort)
			.map(level => {
				const _id = foundry.utils.randomID();
				const childrenAtLevel = childrenByLevel[level];
				childrenAtLevel.forEach(child => child.advancementId = _id);
				return {
					_id,
					type: "ItemGrant",
					level,
					title: "Features",
					icon: parentEmbeddedDocument.img,
					// region
					// Required (as of dnd5e 1.6.0) to avoid a crash when flipping the Configuration toggle on the
					//   advancements tab.
					configuration: {
						items: [],
					},
					// endregion
					value: {
						added: childrenAtLevel.mergeMap(it => ({[it.embeddedDocument.id]: ""})),
					},
				};
			});

		// Get the list of existing advancements
		const existingAdvancement = MiscUtil.copy(parentEmbeddedDocument.data?.data?.advancement || []);

		// Merge any new advancements into the existing array, and remove them
		const advancementToAdd = newAdvancement.filter(newAdv => {
			const oldAdv = existingAdvancement.find(it => it.level === newAdv.level);
			if (!oldAdv) return true;

			if (newAdv?.value?.added) {
				const tgt = MiscUtil.getOrSet(oldAdv, "value", "added", {});
				Object.assign(tgt, newAdv.value.added);
			}

			// Update the child ID to reflect its new parent advancement
			childrenByLevel[newAdv.level].forEach(child => child.advancementId = oldAdv._id);

			return false;
		});

		const updatedMetas = await UtilDocuments.pUpdateEmbeddedDocuments(
			actor,
			[
				{
					_id: parentEmbeddedDocument.id,
					data: {
						advancement: [
							...existingAdvancement,
							...advancementToAdd,
						],
					},
				},
			],
			{
				propData: "items",
				ClsEmbed: Item,
			},
		);
		const updatedParentDoc = updatedMetas[0]?.document;
		if (!updatedParentDoc) return;

		await UtilDocuments.pUpdateEmbeddedDocuments(
			actor,
			childLevelledEmbeddedDocuments.map(child => ({
				_id: child.embeddedDocument.id,
				flags: {
					dnd5e: {
						advancementOrigin: `${updatedParentDoc.id}.${child.advancementId}`,
					},
				},
			})),
			{
				propData: "items",
				ClsEmbed: Item,
			},
		);
	}
}

export {UtilAdvancements};
