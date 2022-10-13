import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {UtilCompat} from "./UtilCompat.js";
import {UtilDocuments} from "./UtilDocuments.js";

class Patcher_RollData {
	static init () {
		if (game.user.isGM) return;
		this._init_player_bindCharacterUpdateHook();
	}

	/**
	 * As a player, when our character gets updated, find any other actors we control, check if they use any
	 * "@srd5e.userchar" data, and if so, trigger an update on them. This allows changes to propagate without manually
	 * forcing an update on the slaved sheets.
	 */
	static _init_player_bindCharacterUpdateHook () {
		Hooks.on("updateActor", (actor) => {
			if (!Config.get("actor", "isRefreshOtherOwnedSheets")) return;
			if (game.user.character?.id !== actor?.id) return;

			const toRefresh = game.actors.contents.filter(act => {
				if (game.user.character.id === act.id || !act.isOwner) return false;

				let found = false;
				Patcher_RollData._PLAYER_CONTROLLED_NON_CHARS_WALKER.walk(
					act.data._source,
					{
						string: (str) => {
							if (!str.includes(Patcher_RollData._PLAYER_CONTROLLED_NON_CHARS_SENTINEL)) return;
							return found = true;
						},
					},
				);
				return found;
			});

			toRefresh.forEach(act => {
				act.prepareData();
				if (act.sheet?.element?.length) act.sheet.render();
			});
		});
	}

	static addAdditionalRollDataBase (rollData, entity) {
		const userChar = Patcher_RollData._getUserChar(entity);

		// Add info from the user's character
		// `@srd5e.userchar.id`, etc.
		const pb = userChar?.data?.data?.attributes?.prof;
		let baseSpellAttackMod = null;
		if (userChar) {
			const scAbility = userChar ? userChar.data?.data.attributes.spellcasting || "int" : null;
			baseSpellAttackMod = (userChar.data?.data?.abilities?.[scAbility].mod ?? 0)
				+ (pb ?? 0);
		}

		const additionalRollData = {
			// Add `@name` as the entity's name
			name: entity.name,
			[SharedConsts.MODULE_NAME_FAKE]: {
				name: {
					// Add `@srd5e.name.<scrubbed entity name>`
					[entity.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "")]: 1,
				},
				user: {
					id: game.user.id,
				},
				userchar: {
					id: userChar?.id,
					pb,
					spellAttackRanged: baseSpellAttackMod,
					spellAttackMelee: baseSpellAttackMod,
					...[
						"abilities",
						"attributes",
						"details",
						"traits",
						"currency",
						"skills",
						"spells",
						"bonuses",
						"resources",
						"movement",
					]
						.mergeMap(prop => ({[prop]: MiscUtil.get(userChar, "data", "data", prop)})),
					...[
						"classes",
					]
						.mergeMap(prop => {
							const obj = userChar?.[prop];
							if (obj == null) return {[prop]: undefined};

							const cpy = {...obj};

							Object.entries(cpy)
								.forEach(([k, item]) => {
									cpy[k] = MiscUtil.get(item, "data", "data");
								});

							return {[prop]: cpy};
						}),
				},
			},
		};

		Object.assign(rollData, additionalRollData);

		// region Evaluate these late, as we need to handle bonuses which may contain complex expressions
		if (userChar && baseSpellAttackMod != null) {
			rollData[SharedConsts.MODULE_NAME_FAKE].userchar.spellAttackRanged += UtilDocuments.getEvaluatedExpression(entity, userChar.data?.data?.bonuses?.rsak?.attack, rollData);
			rollData[SharedConsts.MODULE_NAME_FAKE].userchar.spellAttackMelee += UtilDocuments.getEvaluatedExpression(entity, userChar.data?.data?.bonuses?.msak?.attack, rollData);
		}
		// endregion

		return additionalRollData;
	}

	static _getUserChar (entity) {
		if (!game.user.isGM) return game.user.character;

		for (let i = 0; i < 100 && entity?.parent; ++i) entity = entity.parent;
		if (!entity) return null; // Should never occur

		// If this is a user's character (or an item belonging to that character), always return that character
		if (game.users.contents.some(it => it.character?.id === entity.id)) return entity;

		const permissions = entity.data?.permission;

		const potentialUsers = Object.entries(permissions)
			.filter(([userId, permLevel]) => permLevel >= CONST.ENTITY_PERMISSIONS.OWNER && !game.users.get(userId)?.isGM)
			.map(([userId]) => userId);

		if (potentialUsers.length !== 1) return null;

		return game.users.get(potentialUsers[0])?.character;
	}

	/**
	 * If running Babele, add the actor's classes to the roll data under their English names. This avoids cases where
	 *   e.g. our active effects are looking for "barbarian," and finding "barbaro."
	 */
	static addBabeleCompatibilityRollData (rollData, actor) {
		if (!UtilCompat.isBabeleActive()) return;

		actor.items.filter(it => it.type === "class")
			.forEach(item => {
				const originalName = item.getFlag("babele", "originalName");
				if (!originalName || originalName === item.name) return;

				// Taken from `Actor5e.classes`
				const originalNameSlug = originalName.slugify({strict: true});

				// Taken from `Actor5e.getRollData`
				if (rollData?.classes?.[originalNameSlug]) return;

				MiscUtil.set(rollData, "classes", originalNameSlug, item.data.data);
			});
	}
}
Patcher_RollData._PLAYER_CONTROLLED_NON_CHARS_WALKER = MiscUtil.getWalker({isNoModification: true, isBreakOnReturn: true});
Patcher_RollData._PLAYER_CONTROLLED_NON_CHARS_SENTINEL = `@${SharedConsts.MODULE_NAME_FAKE}.userchar.`;

export {Patcher_RollData};
