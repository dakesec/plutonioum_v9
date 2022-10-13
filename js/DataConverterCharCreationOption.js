import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {Vetools} from "./Vetools.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {DataConverterFeature} from "./DataConverterFeature.js";
import {PageFilterClassesFoundry} from "./UtilCharactermancerClass.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";

class DataConverterCharCreationOption extends DataConverterFeature {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryCharoption",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "charoption",
	};

	static init () {
		PageFilterClassesFoundry.setImplSideData("charoption", this);
	}

	static async pGetDereferencedCharCreationOptionFeatureItem (feature) {
		const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CHAR_CREATION_OPTIONS](feature);
		return Renderer.hover.pCacheAndGet(UrlUtil.PG_CHAR_CREATION_OPTIONS, feature.source, hash, {isCopy: true});
	}

	static async pGetInitCharCreationOptionFeatureLoadeds (feature, {actor = null} = {}) {
		const asFeatRef = {charoption: `${feature.name}|${feature.source}`};
		await PageFilterClassesFoundry.pInitCharCreationOptionLoadeds({charoption: asFeatRef, raw: feature, actor});
		return asFeatRef;
	}

	/**
	 * @param ent
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 * @param [opts.actor]
	 */
	static async pGetCharCreationOptionItem (ent, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		return this._pGetCharCreationOptionItem(ent, opts);
	}

	static async _pGetCharCreationOptionItem (ent, opts) {
		const descriptionValue = Config.get("importCharCreationOption", "isImportDescription")
			? await UtilDataConverter.pGetWithDescriptionPlugins(() => {
				const prerequisite = Renderer.utils.getPrerequisiteHtml(ent.prerequisite);
				return `<div>
					${prerequisite ? `<p><i>Prerequisite: ${prerequisite}</i></p>` : ""}
					${Renderer.get().setFirstSection(true).render({entries: ent.entries}, 2)}
				</div>`;
			})
			: null;

		const img = await this._pGetSaveImagePath(ent, {propCompendium: "charoption"});

		const additionalData = await this._pGetDataSideLoaded(ent);
		const additionalFlags = await this._pGetFlagsSideLoaded(ent);

		// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
		const effectsSideTuples = opts.isActorItem ? [] : await this._pGetEffectsSideLoadedTuples({ent, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importCharCreationOption", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(ent, {isActorItem: opts.isActorItem})),
			data: {
				source: UtilDataConverter.getSourceWithPagePart(ent),
				description: {value: descriptionValue, chat: "", unidentified: ""},

				activation: {type: "", cost: 0, condition: ""},
				duration: {value: 0, units: ""},
				target: {value: 0, units: "", type: ""},
				range: {value: 0, long: 0, units: null},
				uses: {value: 0, max: 0, per: ""},
				ability: "",
				actionType: "",
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: [], versatile: ""},
				formula: "",
				save: {ability: "", dc: null},
				requirements: "",
				recharge: {value: 0, charged: true},

				...additionalData,
			},
			permission: {default: 0},
			type: "feat",
			img,
			flags: {
				...this._getCharCreationOptionFlags(ent, opts),
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importCharCreationOption", "permissions")};

		return out;
	}

	static _getCharCreationOptionFlags (ent, opts) {
		opts = opts || {};

		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_CHAR_CREATION_OPTIONS,
				source: ent.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CHAR_CREATION_OPTIONS](ent),
			},
		};

		if (opts.isAddDataFlags) {
			out[SharedConsts.MODULE_NAME_FAKE].propDroppable = "charoption";
			out[SharedConsts.MODULE_NAME_FAKE].filterValues = opts.filterValues;
		}

		return out;
	}

	static async pMutActorUpdateCharCreationOption (actor, actorUpdate, ent, dataBuilderOpts) {
		const sideData = await this.pGetSideLoadedMatch(ent);
		this.mutActorUpdate(actor, actorUpdate, ent, {sideData});
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGetCharCreationOptionSideData();
		return this._SIDE_DATA;
	}

	static async pHasCharCreationOptionSideLoadedEffects (actor, ent) {
		return (await this._pGetEffectsRawSideLoaded_(ent, this._SIDE_LOAD_OPTS))?.length > 0;
	}

	static async pGetCharCreationOptionItemEffectTuples (actor, ent, sheetItem, {additionalData, img} = {}) {
		const effectsRaw = await this._pGetEffectsRawSideLoaded_(ent, this._SIDE_LOAD_OPTS);
		return UtilActiveEffects.getExpandedEffects(effectsRaw || [], {actor, sheetItem, parentName: ent.name, additionalData, img}, {isTuples: true});
	}
}

export {DataConverterCharCreationOption};
