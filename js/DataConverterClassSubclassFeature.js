import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {Vetools} from "./Vetools.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {DataConverterFeature} from "./DataConverterFeature.js";
import {Charactermancer_Class_Util, PageFilterClassesFoundry} from "./UtilCharactermancerClass.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";

class DataConverterClassSubclassFeature extends DataConverterFeature {
	static _getSideLoadOpts (feature) {
		return {
			propBrew: this._getBrewProp(feature),
			fnLoadJson: Vetools.pGetClassSubclassSideData,
			propJson: this._getEntityType(feature),
			propsMatch: ["classSource", "className", "subclassSource", "subclassShortName", "level", "source", "name"],
		};
	}

	static init () {
		PageFilterClassesFoundry.setImplSideData("classFeature", this);
		PageFilterClassesFoundry.setImplSideData("subclassFeature", this);
	}

	static async pGetDereferencedClassSubclassFeatureItem (feature) {
		const type = this._getEntityType(feature);
		const hash = UrlUtil.URL_TO_HASH_BUILDER[type](feature);
		// `type` will be either `classFeature` or `subclassFeature`; passing either of these to the standard cache-get
		//   will return a de-referenced version.
		return Renderer.hover.pCacheAndGet(type, feature.source, hash, {isCopy: true});
	}

	static async pGetInitClassSubclassFeatureLoadeds (feature, {actor = null} = {}) {
		const isIgnoredLookup = await this._pGetInitClassSubclassFeatureLoadeds_getIsIgnoredLookup(feature);

		const type = this._getEntityType(feature);
		switch (type) {
			case "classFeature": {
				const uid = DataUtil.class.packUidClassFeature(feature);
				const asClassFeatureRef = {classFeature: uid};
				await PageFilterClassesFoundry.pInitClassFeatureLoadeds({classFeature: asClassFeatureRef, className: feature.className, actor, isIgnoredLookup});
				return asClassFeatureRef;
			}
			case "subclassFeature": {
				const uid = DataUtil.class.packUidSubclassFeature(feature);
				const asSubclassFeatureRef = {subclassFeature: uid};
				const subclassNameLookup = await DataUtil.class.pGetSubclassLookup();
				const subclassName = MiscUtil.get(subclassNameLookup, feature.classSource, feature.className, feature.subclassSource, feature.subclassShortName);
				await PageFilterClassesFoundry.pInitSubclassFeatureLoadeds({subclassFeature: asSubclassFeatureRef, className: feature.className, subclassName: subclassName, actor, isIgnoredLookup});
				return asSubclassFeatureRef;
			}
			default: throw new Error(`Unhandled feature type "${type}"`);
		}
	}

	static async _pGetInitClassSubclassFeatureLoadeds_getIsIgnoredLookup (feature) {
		if (!feature.entries) return {};

		const type = this._getEntityType(feature);
		switch (type) {
			case "classFeature": {
				return this.pGetClassSubclassFeatureIgnoredLookup({data: {classFeature: [feature]}});
			}
			case "subclassFeature": {
				return this.pGetClassSubclassFeatureIgnoredLookup({data: {subclassFeature: [feature]}});
			}
			default: throw new Error(`Unhandled feature type "${type}"`);
		}
	}

	static async pGetClassSubclassFeatureIgnoredLookup ({data}) {
		if (!data.classFeature?.length && !data.subclassFeature?.length) return {};

		const isIgnoredLookup = {};

		const allRefsClassFeature = new Set();
		const allRefsSubclassFeature = new Set();
		(data.classFeature || []).forEach(cf => {
			const refs = Charactermancer_Class_Util.getClassSubclassFeatureReferences(cf.entries);
			refs.forEach(ref => allRefsClassFeature.add((ref.classFeature || "").toLowerCase()));
		});
		(data.subclassFeature || []).forEach(scf => {
			const refs = Charactermancer_Class_Util.getClassSubclassFeatureReferences(scf.entries);
			refs.forEach(ref => allRefsSubclassFeature.add((ref.subclassFeature || "").toLowerCase()));
		});

		for (const uid of allRefsClassFeature) {
			if (await this._pGetIsIgnoredSideLoaded(DataUtil.class.unpackUidClassFeature(uid))) {
				isIgnoredLookup[uid] = true;
			}
		}

		for (const uid of allRefsSubclassFeature) {
			if (await this._pGetIsIgnoredSideLoaded(DataUtil.class.unpackUidSubclassFeature(uid))) {
				isIgnoredLookup[uid] = true;
			}
		}

		return isIgnoredLookup;
	}

	/**
	 * @param feature
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.filterValues] Pre-baked filter values to be re-used when importing this from the item.
	 * @param [opts.isAddDataFlags]
	 * @param [opts.isActorItem]
	 * @param [opts.type] The (optional) feature type. If not specified, will be automatically chosen.
	 * @param [opts.actor] The actor the feature will belong to.
	 */
	static async pGetClassSubclassFeatureItem (feature, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		const out = await this._pGetClassSubclassFeatureItem(feature, opts);

		const additionalData = await this._pGetDataSideLoaded(feature);
		Object.assign(out.data, additionalData);

		const additionalFlags = await this._pGetFlagsSideLoaded(feature);
		Object.assign(out.flags, additionalFlags);

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importClassSubclassFeature", "permissions")};

		return out;
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGetClassSubclassSideData();
		return this._SIDE_DATA;
	}

	static async pHasClassSubclassSideLoadedEffects (actor, feature) {
		if (this._isUnarmoredDefense(feature)) return true;
		return (
			await this._pGetEffectsRawSideLoaded_(
				feature,
				this._getSideLoadOpts(feature),
			)
		)?.length > 0;
	}

	static _isUnarmoredDefense (feature) {
		const cleanLowerName = (feature.name || "").toLowerCase().trim();
		return /^unarmored defen[sc]e/.test(cleanLowerName);
	}

	static _getUnarmoredDefenseMeta (entity) {
		if (!entity.entries) return null;

		const attribs = new Set();

		JSON.stringify(entity.entries).replace(/(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha) modifier/gi, (fullMatch, ability) => {
			ability = ability.slice(0, 3).toLowerCase();
			attribs.add(ability);
		});

		const predefinedKey = CollectionUtil.setEq(DataConverterClassSubclassFeature._UNARMORED_DEFENSE_BARBARIAN, attribs) ? "unarmoredBarb" : CollectionUtil.setEq(DataConverterClassSubclassFeature._UNARMORED_DEFENSE_MONK, attribs) ? "unarmoredMonk" : null;

		return {
			formula: ["10", ...[...attribs].map(ab => `@abilities.${ab}.mod`)].join(" + "),
			abilities: [...attribs],
			predefinedKey,
		};
	}

	static async pGetClassSubclassFeatureItemEffectTuples (actor, feature, sheetItem, {additionalData, img} = {}) {
		const out = [];

		if (this._isUnarmoredDefense(feature)) {
			const unarmoredDefenseMeta = this._getUnarmoredDefenseMeta(feature);
			if (unarmoredDefenseMeta) {
				let fromUnarmoredDefence;
				if (unarmoredDefenseMeta.predefinedKey) {
					fromUnarmoredDefence = UtilActiveEffects.getExpandedEffects(
						[
							{
								name: "Unarmored Defense",
								changes: [
									{
										key: "data.attributes.ac.calc",
										mode: "OVERRIDE",
										value: unarmoredDefenseMeta.predefinedKey,
									},
								],
							},
						],
						{
							actor,
							sheetItem,
							parentName: feature.name,
							additionalData,
						},
						{
							isTuples: true,
						},
					);
				} else {
					fromUnarmoredDefence = UtilActiveEffects.getExpandedEffects(
						[
							{
								name: "Unarmored Defense",
								changes: [
									{
										key: "data.attributes.ac.calc",
										mode: "OVERRIDE",
										value: "custom",
									},
								],
							},
							{
								name: "Unarmored Defense",
								changes: [
									{
										key: "data.attributes.ac.formula",
										mode: "UPGRADE",
										value: unarmoredDefenseMeta.formula,
									},
								],
							},
						],
						{
							actor,
							sheetItem,
							parentName: feature.name,
							additionalData,
						},
						{
							isTuples: true,
						},
					);
				}

				if (fromUnarmoredDefence) out.push(...fromUnarmoredDefence);
			}
		}

		const effectsRaw = await this._pGetEffectsRawSideLoaded_(
			feature,
			this._getSideLoadOpts(feature),
		);
		const fromSide = UtilActiveEffects.getExpandedEffects(
			effectsRaw || [],
			{
				actor,
				sheetItem,
				parentName: feature.name,
				additionalData,
				img,
			},
			{
				isTuples: true,
			},
		);
		if (fromSide) out.push(...fromSide);

		return out;
	}

	static async _pGetClassSubclassFeatureItem (feature, opts) {
		opts = opts || {};

		let {type = null, actor} = opts;
		type = type || this._getEntityType(feature);

		let pOut;
		if (await this._pIsInSrd(feature, type)) {
			pOut = this._pGetClassSubclassFeatureItem_fromSrd(feature, type, actor, opts);
		} else {
			pOut = this._pGetClassSubclassFeatureItem_other(feature, type, actor, opts);
		}
		return pOut;
	}

	static _getEntityType (feature) {
		if (feature.subclassShortName) return "subclassFeature";
		if (feature.className) return "classFeature";
		return null;
	}

	static _getBrewProp (feature) {
		const type = this._getEntityType(feature);
		switch (type) {
			case "classFeature": return "foundryClassFeature";
			case "subclassFeature": return "foundrySubclassFeature";
			default: throw new Error(`Unhandled feature type "${type}"`);
		}
	}

	static async _pIsInSrd (feature, type) {
		const srdData = await UtilCompendium.getSrdCompendiumEntity(type, feature, {fnGetAliases: this._getCompendiumAliases});
		return !!srdData;
	}

	static async _pGetClassSubclassFeatureItem_fromSrd (feature, type, actor, opts) {
		const srdData = await UtilCompendium.getSrdCompendiumEntity(type, feature, {fnGetAliases: this._getCompendiumAliases});

		const img = await this._pGetSaveImagePath(feature, {propCompendium: type});

		const dataConsume = this._getData_getConsume({ent: feature, actor: opts.actor});

		const effects = (MiscUtil.copy(srdData.effects || []))
			.filter(eff => {
				// Filter out well-known unarmored defense effects, as we add these ourselves.
				eff.changes = ([] || eff.changes).filter(it => !["unarmoredBarb", "unarmoredMonk"].includes(it.value));
				if (!eff.changes.length) return false;

				return true;
			});
		DataConverter.mutEffectsDisabledTransfer(effects, "importClassSubclassFeature");

		// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
		const effectsSideTuples = opts.isActorItem ? [] : UtilActiveEffects.getExpandedEffects(feature.effectsRaw, {actor, img, parentName: feature.name}, {isTuples: true});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importClassSubclassFeature", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		return {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(feature, {isActorItem: actor != null})),
			type: srdData.type,
			data: {
				...srdData.data,

				source: UtilDataConverter.getSourceWithPagePart(feature),
				description: {value: await this.pGetEntryDescription(feature), chat: "", unidentified: ""},
				consume: dataConsume,

				...(feature.foundryAdditionalData || {}),
			},
			effects: [
				...effects,
				...effectsSideTuples.map(it => it.effect),
			],
			flags: {
				...this._getClassSubclassFeatureFlags(feature, type, opts),
				...(feature.foundryAdditionalFlags || {}),
			},
			img,
		};
	}

	static _getClassSubclassFeatureFlags (feature, type, opts) {
		opts = opts || {};

		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_CLASS_SUBCLASS_FEATURES,
				source: feature.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CLASS_SUBCLASS_FEATURES](feature),
			},
		};

		if (opts.isAddDataFlags) {
			out[SharedConsts.MODULE_NAME_FAKE].propDroppable = this._getEntityType(feature);
			out[SharedConsts.MODULE_NAME_FAKE].filterValues = opts.filterValues;
		}

		return out;
	}

	static async _pGetClassSubclassFeatureItem_other (feature, type, actor, opts) {
		const dataConsume = this._getData_getConsume({ent: feature, actor: opts.actor});

		const img = await this._pGetSaveImagePath(feature, {propCompendium: type});

		// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
		const effectsSideTuples = opts.isActorItem ? [] : UtilActiveEffects.getExpandedEffects(feature.effectsRaw, {actor, img, parentName: feature.name}, {isTuples: true});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importClassSubclassFeature", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		return this.pGetItemActorPassive(
			feature,
			{
				mode: "player",
				modeOptions: {
					isChannelDivinity: feature.className === "Cleric" && feature.name.toLowerCase().startsWith("channel divinity:"),
				},
				renderDepth: 0,
				fvttType: "feat",
				img,
				fvttSource: UtilDataConverter.getSourceWithPagePart(feature),
				requirements: [feature.className, feature.level, feature.subclassShortName ? `(${feature.subclassShortName})` : ""].filter(Boolean).join(" "),
				additionalData: feature.foundryAdditionalData,
				foundryFlags: this._getClassSubclassFeatureFlags(feature, type, opts),
				additionalFlags: feature.foundryAdditionalFlags,
				effects: effectsSideTuples.map(it => it.effect),
				actor,
				consumeType: dataConsume.type,
				consumeTarget: dataConsume.target,
				consumeAmount: dataConsume.amount,
			},
		);
	}

	static _getCompendiumAliases (entity) {
		if (!entity.name) return [];

		const out = [];

		const lowName = entity.name.toLowerCase().trim();

		const noBrackets = entity.name
			.replace(/\([^)]+\)/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (noBrackets !== entity.name) out.push(noBrackets);

		const splitColon = entity.name.split(":")[0].trim();
		const isSplitColonName = splitColon !== entity.name;
		if (isSplitColonName) {
			out.push(splitColon);

			// Handle e.g. `Channel Divinity: X` -> `Channel Divinity (Cleric)`
			if (DataConverterClassSubclassFeature._FEATURE_SRD_ASLIAS_WITH_CLASSNAME.has(splitColon.toLowerCase())) {
				out.push(`${splitColon} (${entity.className})`);
			}
		}

		if (DataConverterClassSubclassFeature._FEATURE_SRD_ASLIAS_WITH_CLASSNAME.has(lowName)) {
			out.push(`${entity.name} (${entity.className})`);
		}

		if (lowName.startsWith("mystic arcanum")) {
			out.push(`${noBrackets} (${((entity.level - 9) / 2) + 5}th-Level Spell)`);
		}

		if (!isSplitColonName) {
			out.push(`Channel Divinity: ${entity.name}`);
			out.push(`Ki: ${entity.name}`);
		}

		return out;
	}

	static async pMutActorUpdateClassSubclassFeatureItem (actor, actorUpdate, feature, dataBuilderOpts) {
		const sideData = await this.pGetSideLoadedMatch(feature);
		this.mutActorUpdate(actor, actorUpdate, feature, {sideData});
	}
}

DataConverterClassSubclassFeature._FEATURE_SRD_ASLIAS_WITH_CLASSNAME = new Set([
	"unarmored defense",
	"channel divinity",
	"expertise",
	"land's stride",
	"timeless body",
	"spellcasting",
]);

DataConverterClassSubclassFeature._UNARMORED_DEFENSE_BARBARIAN = new Set(["dex", "con"]);
DataConverterClassSubclassFeature._UNARMORED_DEFENSE_MONK = new Set(["dex", "wis"]);

export {DataConverterClassSubclassFeature};
