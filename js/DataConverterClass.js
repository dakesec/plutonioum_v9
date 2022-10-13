import {SharedConsts} from "../shared/SharedConsts.js";
import {UtilApplications} from "./UtilApplications.js";
import {Config} from "./Config.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilActors} from "./UtilActors.js";
import {Consts} from "./Consts.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {DataConverterClassSubclassFeature} from "./DataConverterClassSubclassFeature.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {
	Charactermancer_Class_ProficiencyImportModeSelect,
	PageFilterClassesFoundry,
} from "./UtilCharactermancerClass.js";
import {UtilItem} from "./UtilItem.js";

class DataConverterClass extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryClass",
		fnLoadJson: async () => this.pPreloadSideData(),
		propJson: "class",
	};

	static _SIDE_LOAD_OPTS_SUBCLASS = {
		propBrew: "foundrySubclass",
		fnLoadJson: async () => this.pPreloadSideData(),
		propJson: "subclass",
		propsMatch: ["classSource", "className", "source", "name"],
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/laurels.svg`;

	static init () {
		PageFilterClassesFoundry.setImplSideData("class", this);
		PageFilterClassesFoundry.setImplSideData("subclass", this);
	}

	static _getDoNotUseNote () {
		return UtilDataConverter.pGetWithDescriptionPlugins(() => `<p>${Renderer.get().render(`{@note Note: importing a class as an item is provided for display purposes only. If you wish to import a class to a character sheet, please use the importer on the sheet instead.}`)}</p>`);
	}

	static _getDataHitDice (cls) { return `d${(cls.hd || {}).faces || 6}`; }

	static _getDataSaves (cls) {
		return (cls.proficiency || [])
			.filter(it => Parser.ATB_ABV_TO_FULL[it]);
	}

	static async pGetClassImagePath (cls, {isReturnDefault = true} = {}) {
		if (cls.foundryImg) return cls.foundryImg;
		const fromCompendium = await UtilCompendium.pGetCompendiumImage("class", cls);
		if (fromCompendium) return fromCompendium;
		return isReturnDefault ? `modules/${SharedConsts.MODULE_NAME}/media/icon/laurels.svg` : null;
	}

	static async _pGetSubclassImagePath (cls, sc) {
		if (sc.foundryImg) return sc.foundryImg;
		const fromCompendium = await UtilCompendium.pGetCompendiumImage("subclass", sc);
		if (fromCompendium) return fromCompendium;
		if (Config.get("importClass", "isUseDefaultSubclassImage")) {
			const fromClass = await this.pGetClassImagePath(cls, {isReturnDefault: false});
			if (fromClass) return fromClass;
		}
		return `modules/${SharedConsts.MODULE_NAME}/media/icon/laurels.svg`;
	}

	/**
	 * @param cls The class entry.
	 * @param [opts] Options object.
	 * @param [opts.sc]
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.filterValues] Pre-baked filter values to be re-used when importing this class from the item.
	 * @param [opts.pageFilter] Filter to use to trim down entries.
	 * @param [opts.startingSkills] Chosen starting skills
	 * @param [opts.proficiencyImportMode]
	 * @param [opts.level]
	 *
	 * @param [opts.isClsDereferenced]
	 *
	 * @param [opts.isActorItem]
	 * @param [opts.actor]
	 *
	 * @return {object}
	 */
	static async pGetClassItem (cls, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		if (!opts.isClsDereferenced) {
			// Dereference features and render as a simple entity array
			cls = MiscUtil.copy(cls);
			cls = await DataUtil.class.pGetDereferencedClassData(cls);
		}

		if (opts.pageFilter && opts.filterValues) {
			cls = MiscUtil.copy(cls);

			Renderer.class.mutFilterDereferencedClassFeatures({
				cpyCls: cls,
				pageFilter: opts.pageFilter,
				filterValues: opts.filterValues,
			});
		}

		const srdData = await UtilCompendium.getSrdCompendiumEntity("class", cls);

		const identifierCls = UtilItem.getNameAsIdentifier(cls.name);

		const img = await Vetools.pOptionallySaveImageToServerAndGetUrl(await this.pGetClassImagePath(cls));

		const additionalData = await this._pGetDataSideLoaded(cls);
		const additionalFlags = await this._pGetFlagsSideLoaded(cls);
		const additionalAdvancement = await this._pGetAdvancementSideLoaded(cls);

		// For actor items, effects are handled elsewhere during the import process
		const effectsSideTuples = opts.isActorItem ? [] : await this._pGetEffectsSideLoadedTuples({ent: cls, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importClass", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(cls, {isActorItem: opts.isActorItem})),
			type: "class",
			data: {
				identifier: identifierCls,
				description: {
					value: await this._pGetClassDescription(cls, opts),
					chat: "",
					unidentified: "",
				},
				source: UtilDataConverter.getSourceWithPagePart(cls),
				levels: opts.level ?? Consts.CHAR_MAX_LEVEL,
				hitDice: this._getDataHitDice(cls),
				hitDiceUsed: 0,
				spellcasting: {
					progression: UtilActors.getMappedCasterType(cls.casterProgression) || cls.casterProgression,
					ability: cls.spellcastingAbility,
				},
				saves: opts.proficiencyImportMode === Charactermancer_Class_ProficiencyImportModeSelect.MODE_PRIMARY
					? this._getDataSaves(cls)
					: [],
				skills: {
					number: opts.proficiencyImportMode === Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS
						? (cls._cntStartingSkillChoicesMutliclass || 0)
						: (cls._cntStartingSkillChoices || 0),
					choices: opts.proficiencyImportMode === Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS
						? this._getAllSkillChoices((MiscUtil.get(cls, "multiclassing", "proficienciesGained", "skills") || []))
						: this._getAllSkillChoices((MiscUtil.get(cls, "startingProficiencies", "skills") || [])),
					value: opts.startingSkills,
				},
				advancement: [
					...(srdData?.data?.advancement || [])
						.filter(it => it.type === "ScaleValue"),
					...(additionalAdvancement || []),
				],

				...additionalData,
			},
			flags: {
				...this._getClassSubclassFlags({
					cls,
					sc: opts.sc,
					filterValues: opts.filterValues,
					proficiencyImportMode: opts.proficiencyImportMode,
					isActorItem: opts.isActorItem,
				}),
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
			img,
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importClass", "permissions")};

		return out;
	}

	static async _pGetClassDescription (cls, opts) {
		const ptDoNotUse = !opts.isActorItem ? await this._getDoNotUseNote() : "";

		const ptTable = await UtilDataConverter.pGetWithDescriptionPlugins(() => this.pGetRenderedClassTable(cls));

		const ptFluff = cls?.fluff?.length
			? Renderer.get().setFirstSection(true).render({type: cls.fluff[0].type || "section", entries: cls.fluff[0].entries || []})
			: "";

		const ptFeatures = !opts.isActorItem
			? await UtilDataConverter.pGetWithDescriptionPlugins(() => Renderer.get().setFirstSection(true).render({type: "section", entries: cls.classFeatures.flat()}))
			: "";

		// Always import the note and the table
		if (!Config.get("importClass", "isImportDescription")) return `<div class="mb-2 ve-flex-col">${ptDoNotUse}${ptTable}</div>`;

		return `<div class="mb-2 ve-flex-col">${ptDoNotUse}${ptTable}${ptFluff}${ptFeatures}</div>`;
	}

	static _getClassSubclassFlags ({cls, sc, filterValues, proficiencyImportMode, isActorItem}) {
		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_CLASSES,
				source: cls.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CLASSES](cls),

				sourceSubclass: sc ? sc.source : null,
				hashSubclass: sc ? UrlUtil.URL_TO_HASH_BUILDER["subclass"](sc) : null,

				propDroppable: sc ? "subclass" : "class",
				filterValues,

				isPrimaryClass: proficiencyImportMode === Charactermancer_Class_ProficiencyImportModeSelect.MODE_PRIMARY,
			},
		};

		if (isActorItem) out[SharedConsts.MODULE_NAME_FAKE].isDirectImport = true;

		return out;
	}

	static _getAllSkillChoices (skillProfs) {
		const allSkills = new Set();

		skillProfs.forEach(skillProfGroup => {
			Object.keys(Parser.SKILL_TO_ATB_ABV)
				.filter(skill => skillProfGroup[skill])
				.forEach(skill => allSkills.add(skill));

			if (skillProfGroup.choose?.from?.length) {
				skillProfGroup.choose.from
					.filter(skill => Parser.SKILL_TO_ATB_ABV[skill])
					.forEach(skill => allSkills.add(skill));
			}
		});

		return Object.entries(UtilActors.SKILL_ABV_TO_FULL)
			.filter(([, vetKey]) => allSkills.has(vetKey))
			.map(([fvttKey]) => fvttKey);
	}

	/**
	 * @param cls The class entry.
	 * @param sc The subclass entry.
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.filterValues] Pre-baked filter values to be re-used when importing this subclass from the item.
	 * @param [opts.pageFilter]
	 * @param [opts.proficiencyImportMode]
	 *
	 * @param [opts.isScDereferenced]
	 *
	 * @param [opts.isActorItem]
	 * @param [opts.actor]
	 *
	 * @return {object}
	 */
	static async pGetSubclassItem (cls, sc, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		if (!opts.isScDereferenced) {
			// Dereference features and render as a simple entity array
			sc = MiscUtil.copy(sc);
			sc = await DataUtil.class.pGetDereferencedSubclassData(sc);
		}

		if (opts.pageFilter && opts.filterValues) {
			sc = MiscUtil.copy(sc);

			Renderer.class.mutFilterDereferencedSubclassFeatures({
				cpySc: sc,
				pageFilter: opts.pageFilter,
				filterValues: opts.filterValues,
			});
		}

		const srdData = await UtilCompendium.getSrdCompendiumEntity("subclass", sc);

		const identifierCls = UtilItem.getNameAsIdentifier(cls.name);
		const identifierSc = UtilItem.getNameAsIdentifier(sc.name);

		// Use the image of the parent class
		const img = await Vetools.pOptionallySaveImageToServerAndGetUrl(await this._pGetSubclassImagePath(cls, sc));

		// For actor items, effects are handled elsewhere during the import process
		const additionalData = await this._pGetDataSideLoaded(sc, {propOpts: "_SIDE_LOAD_OPTS_SUBCLASS"});
		const additionalFlags = await this._pGetFlagsSideLoaded(sc, {propOpts: "_SIDE_LOAD_OPTS_SUBCLASS"});
		const additionalAdvancement = await this._pGetAdvancementSideLoaded(sc, {propOpts: "_SIDE_LOAD_OPTS_SUBCLASS"});

		const effectsSideTuples = opts.isActorItem ? [] : await this._pGetEffectsSideLoadedTuples({ent: sc, img}, {propOpts: "_SIDE_LOAD_OPTS_SUBCLASS"});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importClass", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(sc, {isActorItem: opts.isActorItem})),
			type: "subclass",
			data: {
				identifier: identifierSc,
				classIdentifier: identifierCls,
				description: {
					value: await this._pGetSubclassDescription(cls, sc, opts),
					chat: "",
					unidentified: "",
				},
				source: UtilDataConverter.getSourceWithPagePart(sc),
				spellcasting: {
					progression: UtilActors.getMappedCasterType(sc.casterProgression) || sc.casterProgression,
					ability: sc.spellcastingAbility,
				},
				advancement: [
					...(srdData?.data?.advancement || [])
						.filter(it => it.type === "ScaleValue"),
					...(additionalAdvancement || []),
				],

				...additionalData,
			},
			flags: {
				...this._getClassSubclassFlags({
					cls,
					sc,
					filterValues: opts.filterValues,
					proficiencyImportMode: opts.proficiencyImportMode,
					isActorItem: opts.isActorItem,
				}),
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
			img,
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importClass", "permissions")};

		return out;
	}

	static async _pGetSubclassDescription (cls, sc, opts) {
		const ptDoNotUse = !opts.isActorItem ? await this._getDoNotUseNote() : "";

		// region """Fluff"""
		const cleanEntries = MiscUtil.getWalker({keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST})
			.walk(
				MiscUtil.copy(sc._fluff.entries),
				{
					array: (arr) => {
						return arr.filter(it => !it?.data?.isFvttSyntheticFeatureLink);
					},
				},
			);

		// Avoid rendering the "fluff" for non-actor items, as it is included in the features render
		const ptFluff = opts.isActorItem
			? Renderer.get().setFirstSection(true).render({type: "entries", entries: cleanEntries})
			: "";
		// endregion

		const ptFeatures = !opts.isActorItem
			? await UtilDataConverter.pGetWithDescriptionPlugins(() => Renderer.get().setFirstSection(true).render({type: "section", entries: sc.subclassFeatures.flat()}))
			: "";

		// Always import the note
		if (!Config.get("importClass", "isImportDescription")) return `<div class="mb-2 ve-flex-col">${ptDoNotUse}</div>`;

		return `<div class="mb-2 ve-flex-col">${ptDoNotUse}${ptFluff}${ptFeatures}</div>`;
	}

	// region Effects, generally defined in side-loaded data
	static async pHasClassSideLoadedEffects ({cls}) {
		const allEffects = await this._pGetClassSubclassItemEffectsRaw({cls});
		return !!allEffects.length;
	}

	static async pHasSubclassSideLoadedEffects ({sc}) {
		const allEffects = await this._pGetClassSubclassItemEffectsRaw({sc});
		return !!allEffects.length;
	}

	static async pGetClassItemEffectTuples ({actor, cls, sheetItem}) {
		const allEffects = await this._pGetClassSubclassItemEffectsRaw({cls});
		return this._getClassSubclassItemEffectTuples(actor, sheetItem, allEffects, {parentName: cls.name});
	}

	static async pGetSubclassItemEffectTuples ({actor, sc, sheetItem}) {
		const allEffects = await this._pGetClassSubclassItemEffectsRaw({sc});
		return this._getClassSubclassItemEffectTuples(actor, sheetItem, allEffects, {parentName: sc.name});
	}

	static async _pGetClassSubclassItemEffectsRaw ({cls, sc}) {
		const sideDataCls = cls ? await this.pGetSideLoadedMatch(cls, "class") : {};
		const sideDataSc = sc ? await this.pGetSideLoadedMatch(sc, "subclass") : {};

		const additionalEffectsRawCls = cls
			? await DataConverter._pGetStarSideLoadedFound(cls, {propFromEntity: "foundryEffects", propFromSideLoaded: "effects", found: sideDataCls})
			: null;
		const additionalEffectsRawSc = sc
			? await DataConverter._pGetStarSideLoadedFound(sc, {propFromEntity: "foundryEffects", propFromSideLoaded: "effects", found: sideDataSc})
			: null;

		return [...(additionalEffectsRawCls || []), ...(additionalEffectsRawSc || [])];
	}

	static _getClassSubclassItemEffectTuples (actor, sheetItem, effects, {parentName = ""} = {}) {
		return UtilActiveEffects.getExpandedEffects(effects, {actor, sheetItem, parentName}, {isTuples: true});
	}
	// endregion

	static async pPreloadSideData () {
		if (!DataConverterClass._SIDE_DATA) DataConverterClass._SIDE_DATA = await Vetools.pGetClassSubclassSideData();
		return DataConverterClass._SIDE_DATA;
	}

	static async pGetSideLoadedMatch (entity, type) {
		if (!entity) return null;

		const brew = await BrewUtil2.pGetBrewProcessed();

		switch (type) {
			case "class": {
				let found = (MiscUtil.get(brew, "foundryClass") || []).find(it => it.name === entity.name && it.source === entity.source);

				if (!found) {
					const additionalData = await this.pPreloadSideData();
					found = (additionalData.class || []).find(it => it.name === entity.name && it.source === entity.source);
				}

				if (!found) return null;
				return found;
			}

			case "subclass": {
				let found = (MiscUtil.get(brew, "foundrySubclass") || []).find(it => it.name === entity.name && it.source === entity.source && it.className === entity.className && it.classSource === entity.classSource);

				if (!found) {
					const additionalData = await this.pPreloadSideData();
					found = (additionalData.subclass || []).find(it => it.name === entity.name && it.source === entity.source && it.className === entity.className && it.classSource === entity.classSource);
				}

				if (!found) return null;
				return found;
			}

			default: throw new Error(`Unhandled type "${type}"`);
		}
	}

	/** Ported from `_render_renderClassTable` */
	static async pGetRenderedClassTable (cls, sc, opts = {}) {
		if (!Config.get("importClass", "isImportClassTable")) return "";

		return UtilDataConverter.pGetWithDescriptionPlugins(async () => {
			// region Get dereferenced class data, so that the features are available
			cls = MiscUtil.copy(cls);
			cls = await DataUtil.class.pGetDereferencedClassData(cls);

			if (sc) {
				sc = MiscUtil.copy(sc);
				sc = await DataUtil.class.pGetDereferencedSubclassData(sc);
			}
			// endregion

			return this.getRenderedClassTableFromDereferenced(cls, sc, opts);
		});
	}

	static getRenderedClassTableFromDereferenced (cls, sc, {isAddHeader = false, isSpellsOnly = false} = {}) {
		if (!cls) return "";

		Renderer.get().setFirstSection(true);

		const tblGroupHeaders = [];
		const tblHeaders = [];

		const renderTableGroupHeader = (tableGroup) => {
			// Render titles (top section)
			let thGroupHeader;
			if (tableGroup.title) {
				thGroupHeader = `<th class="cls-tbl__col-group" colspan="${tableGroup.colLabels.length}">${tableGroup.title}</th>`;
			} else {
				// if there's no title, add a spacer
				thGroupHeader = `<th colspan="${tableGroup.colLabels.length}"></th>`;
			}
			tblGroupHeaders.push(thGroupHeader);

			// Render column headers (bottom section)
			tableGroup.colLabels.forEach(lbl => {
				tblHeaders.push(`<th class="cls-tbl__col-generic-center"><div class="cls__squash_header">${Renderer.get().render(lbl)}</div></th>`);
			});
		};

		if (cls.classTableGroups) {
			cls.classTableGroups.forEach(tableGroup => {
				if (isSpellsOnly) tableGroup = this._getRenderedClassTableFromDereferenced_getSpellsOnlyTableGroup(tableGroup);
				if (!tableGroup) return;
				renderTableGroupHeader(tableGroup);
			});
		}

		if (sc?.subclassTableGroups) {
			sc.subclassTableGroups.forEach(tableGroup => {
				if (isSpellsOnly) tableGroup = this._getRenderedClassTableFromDereferenced_getSpellsOnlyTableGroup(tableGroup);
				if (!tableGroup) return;
				renderTableGroupHeader(tableGroup);
			});
		}

		const tblRows = cls.classFeatures.map((lvlFeatures, ixLvl) => {
			const pb = Math.ceil((ixLvl + 1) / 4) + 1;

			const lvlFeaturesFilt = lvlFeatures
				.filter(it => it.name && it.type !== "inset"); // don't add inset entry names to class table

			const dispsFeatures = lvlFeaturesFilt
				.map((it, ixFeature) => `<div class="inline-block">${it.name}${ixFeature === lvlFeaturesFilt.length - 1 ? "" : `<span class="mr-1">,</span>`}</div>`);

			const ptTableGroups = [];

			const renderTableGroupRow = (tableGroup) => {
				const row = (tableGroup.rowsSpellProgression || tableGroup.rows)[ixLvl] || [];
				const cells = row.map(cell => `<td class="cls-tbl__col-generic-center">${cell === 0 ? "\u2014" : Renderer.get().render(cell)}</td>`);
				ptTableGroups.push(...cells);
			};

			if (cls.classTableGroups) {
				cls.classTableGroups.forEach(tableGroup => {
					if (isSpellsOnly) tableGroup = this._getRenderedClassTableFromDereferenced_getSpellsOnlyTableGroup(tableGroup);
					if (!tableGroup) return;
					renderTableGroupRow(tableGroup);
				});
			}

			if (sc?.subclassTableGroups) {
				sc.subclassTableGroups.forEach(tableGroup => {
					if (isSpellsOnly) tableGroup = this._getRenderedClassTableFromDereferenced_getSpellsOnlyTableGroup(tableGroup);
					if (!tableGroup) return;
					renderTableGroupRow(tableGroup);
				});
			}

			return `<tr class="cls-tbl__stripe-odd">
				<td class="cls-tbl__col-level">${Parser.getOrdinalForm(ixLvl + 1)}</td>
				${isSpellsOnly ? "" : `<td class="cls-tbl__col-prof-bonus">+${pb}</td>`}
				${isSpellsOnly ? "" : `<td>${dispsFeatures.join("") || `\u2014`}</td>`}
				${ptTableGroups.join("")}
			</tr>`;
		});

		// Don't add a class name header, as we assume this will be embedded in some UI that already has one.
		return `<table class="cls-tbl shadow-big w-100 mb-3">
			<tbody>
			<tr><th class="border" colspan="15"></th></tr>
			${isAddHeader ? `<tr><th class="cls-tbl__disp-name" colspan="15">${cls.name}</th></tr>` : ""}
			<tr>
				<th colspan="${isSpellsOnly ? "1" : "3"}"></th>
				${tblGroupHeaders.join("")}
			</tr>
			<tr>
				<th class="cls-tbl__col-level">Level</th>
				${isSpellsOnly ? "" : `<th class="cls-tbl__col-prof-bonus">Proficiency Bonus</th>`}
				${isSpellsOnly ? "" : `<th>Features</th>`}
				${tblHeaders.join("")}
			</tr>
			${tblRows.join("")}
			<tr><th class="border" colspan="15"></th></tr>
			</tbody>
		</table>`;
	}

	static _getRenderedClassTableFromDereferenced_getSpellsOnlyTableGroup (tableGroup) {
		tableGroup = MiscUtil.copy(tableGroup);

		if (/spell/i.test(`${tableGroup.title || ""}`)) return tableGroup;

		if (!tableGroup.colLabels) return null;

		const ixsSpellLabels = new Set(tableGroup.colLabels
			.map((it, ix) => {
				const stripped = Renderer.stripTags(`${it || ""}`);
				return /cantrip|spell|slot level/i.test(stripped) ? ix : null;
			})
			.filter(ix => ix != null));

		if (!ixsSpellLabels.size) return null;

		tableGroup.colLabels = tableGroup.colLabels.filter((_, ix) => ixsSpellLabels.has(ix));
		if (tableGroup.rowsSpellProgression) tableGroup.rowsSpellProgression = tableGroup.rowsSpellProgression.map(row => row.filter((_, ix) => ixsSpellLabels.has(ix)));
		if (tableGroup.rows) tableGroup.rows = tableGroup.rows.map(row => row.filter((_, ix) => ixsSpellLabels.has(ix)));

		return tableGroup;
	}

	static isStubClass (cls) {
		if (!cls) return false;
		return cls.name === DataConverterClass.STUB_CLASS.name && cls.source === DataConverterClass.STUB_CLASS.source;
	}

	static isStubSubclass (sc) {
		if (!sc) return false;
		return sc.name === DataConverterClass.STUB_SUBCLASS.name && sc.source === DataConverterClass.STUB_SUBCLASS.source;
	}

	static getClassStub () {
		const out = MiscUtil.copy(DataConverterClass.STUB_CLASS);
		out.subclasses = [
			{
				...MiscUtil.copy(DataConverterClass.STUB_SUBCLASS),
				className: out.name,
				classSource: out.source,
			},
		];
		return out;
	}

	static getSubclassStub ({cls}) {
		const out = MiscUtil.copy(DataConverterClass.STUB_SUBCLASS);
		out.className = cls.name;
		out.classSource = cls.source;
		return out;
	}
}
DataConverterClass._SIDE_DATA = null;

// region Fake data used in place of missing records when levelling up
//   (i.e. if the same set of sources have not been selected when re-opening the Charactermancer)
DataConverterClass.STUB_CLASS = {
	name: "Unknown Class",
	source: SRC_PHB,
	classFeatures: [...new Array(Consts.CHAR_MAX_LEVEL)].map(() => []),
	_isStub: true,
};
DataConverterClass.STUB_SUBCLASS = {
	name: "Unknown Subclass",
	source: SRC_PHB,
	subclassFeatures: [],
	_isStub: true,
};
// endregion

export {DataConverterClass};
