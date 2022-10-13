import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {Vetools} from "./Vetools.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {DataConverterFeature} from "./DataConverterFeature.js";
import {PageFilterClassesFoundry} from "./UtilCharactermancerClass.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";
import {Charactermancer_Feature_Util} from "./UtilCharactermancerFeature.js";

class DataConverterFeat extends DataConverterFeature {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryFeat",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "feat",
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/mighty-force.svg`;

	static init () {
		PageFilterClassesFoundry.setImplSideData("feat", this);
	}

	static async pGetDereferencedFeatFeatureItem (feature) {
		// Bypass the loader, since we don't expect refs in feats (yet)
		if (feature.entries) return MiscUtil.copy(feature);

		const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_FEATS](feature);
		return Renderer.hover.pCacheAndGet(UrlUtil.PG_FEATS, feature.source, hash, {isCopy: true});
	}

	static async pGetInitFeatFeatureLoadeds (feature, {actor = null} = {}) {
		const uid = DataUtil.proxy.getUid("feat", feature, {isMaintainCase: true});
		const asFeatRef = {feat: uid};
		// Note that passing `raw` here is required, as we will have already modified the feat data in order to add
		//   "optionalfeatureProgression" entries.
		await PageFilterClassesFoundry.pInitFeatLoadeds({feat: asFeatRef, raw: feature, actor});
		return asFeatRef;
	}

	/**
	 * @param feat
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.filterValues] Pre-baked filter values to be re-used when importing this from the item.
	 * @param [opts.isAddDataFlags]
	 * @param [opts.isActorItem]
	 */
	static async pGetFeatItem (feat, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		const cpyFeat = Charactermancer_Feature_Util.getCleanedFeature_tmpOptionalfeatureList(feat);

		const content = await UtilDataConverter.pGetWithDescriptionPlugins(() => {
			const prerequisite = Renderer.utils.getPrerequisiteHtml(cpyFeat.prerequisite);
			Renderer.feat.initFullEntries(cpyFeat);
			return `<div>
				${prerequisite ? `<p><i>Prerequisite: ${prerequisite}</i></p>` : ""}
				${Renderer.get().setFirstSection(true).render({entries: cpyFeat._fullEntries || cpyFeat.entries}, 2)}
			</div>`;
		});

		const img = await this._pGetSaveImagePath(cpyFeat);

		const additionalData = await this._pGetDataSideLoaded(cpyFeat);
		const additionalFlags = await this._pGetFlagsSideLoaded(cpyFeat);

		// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
		const effectsSideTuples = opts.isActorItem ? [] : await this._pGetEffectsSideLoadedTuples({ent: cpyFeat, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importFeat", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(cpyFeat, {isActorItem: opts.isActorItem})),
			data: {
				source: UtilDataConverter.getSourceWithPagePart(cpyFeat),
				description: {
					value: Config.get("importFeat", "isImportDescription") ? content : "",
					chat: "",
					unidentified: "",
				},

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
				requirements: Renderer.utils.getPrerequisiteHtml(cpyFeat.prerequisite, {isTextOnly: true, isSkipPrefix: true}),
				recharge: {value: 0, charged: true},

				...additionalData,
			},
			permission: {default: 0},
			type: "feat",
			img,
			flags: {
				...this._getFeatFlags(cpyFeat, opts),
				...additionalFlags,
			},
			// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
			effects: effectsSideTuples.map(it => it.effect),
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importFeat", "permissions")};

		return out;
	}

	static _pGetImgCustom (feat) {
		return this.pGetIconImage("feat", feat);
	}

	static _getFeatFlags (feat, opts) {
		opts = opts || {};

		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_FEATS,
				source: feat.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_FEATS](feat),
			},
		};

		if (opts.isAddDataFlags) {
			out[SharedConsts.MODULE_NAME_FAKE].propDroppable = "feat";
			out[SharedConsts.MODULE_NAME_FAKE].filterValues = opts.filterValues;
		}

		return out;
	}

	static async pMutActorUpdateFeat (actor, actorUpdate, feat, dataBuilderOpts) {
		const sideData = await this.pGetSideLoadedMatch(feat);
		this.mutActorUpdate(actor, actorUpdate, feat, {sideData});
	}

	static async pHasFeatSideLoadedEffects (actor, feat) {
		return (await this._pGetEffectsRawSideLoaded_(feat, this._SIDE_LOAD_OPTS))?.length > 0;
	}

	static async pGetFeatItemEffectTuples (actor, feat, sheetItem, {additionalData, img} = {}) {
		const effectsRaw = await this._pGetEffectsRawSideLoaded_(feat, this._SIDE_LOAD_OPTS);
		return UtilActiveEffects.getExpandedEffects(effectsRaw || [], {actor, sheetItem, parentName: feat.name, additionalData, img}, {isTuples: true});
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGetFeatSideData();
		return this._SIDE_DATA;
	}
}

export {DataConverterFeat};
