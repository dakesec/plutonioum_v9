import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {Vetools} from "./Vetools.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {PageFilterClassesFoundry} from "./UtilCharactermancerClass.js";
import {DataConverterFeature} from "./DataConverterFeature.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";

class DataConverterReward extends DataConverterFeature {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryReward",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "reward",
	};

	static init () {
		PageFilterClassesFoundry.setImplSideData("reward", this);
	}

	static async pGetDereferencedRewardFeatureItem (feature) {
		// Bypass the loader, since we don't expect refs in rewards (yet)
		if (feature.entries) return MiscUtil.copy(feature);

		const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_REWARDS](feature);
		return Renderer.hover.pCacheAndGet(UrlUtil.PG_REWARDS, feature.source, hash, {isCopy: true});
	}

	static async pGetInitRewardFeatureLoadeds (feature, {actor = null} = {}) {
		const asFeatRef = {reward: `${feature.name}|${feature.source}`};
		// Bypass the loader, since we don't expect refs in rewards (yet)
		await PageFilterClassesFoundry.pInitRewardLoadeds({reward: asFeatRef, raw: feature, actor});
		return asFeatRef;
	}

	/**
	 * @param reward
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 * @param [opts.actor]
	 */
	static async pGetRewardItem (reward, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		const descriptionValue = await this._pGetGenericDescription(reward, "importReward");

		const img = await this._pGetSaveImagePath(reward, {propCompendium: "reward"});

		const additionalData = await this._pGetDataSideLoaded(reward);
		const additionalFlags = await this._pGetFlagsSideLoaded(reward);

		// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
		const effectsSideTuples = opts.isActorItem ? [] : await this._pGetEffectsSideLoadedTuples({ent: reward, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importReward", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(reward, {isActorItem: opts.isActorItem})),
			data: {
				source: UtilDataConverter.getSourceWithPagePart(reward),
				description: {
					value: descriptionValue,
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
				requirements: "",
				recharge: {value: 0, charged: true},

				...additionalData,
			},
			permission: {default: 0},
			type: "feat",
			img,
			flags: {
				...this._getRewardFlags(reward, opts),
				...additionalFlags,
			},
			// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
			effects: effectsSideTuples.map(it => it.effect),
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importReward", "permissions")};

		return out;
	}

	static async pMutActorUpdateReward (actor, actorUpdate, optFeature, dataBuilderOpts) {
		const sideData = await this.pGetSideLoadedMatch(optFeature);
		this.mutActorUpdate(actor, actorUpdate, optFeature, {sideData});
	}

	static _getRewardFlags (reward, opts) {
		opts = opts || {};

		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_REWARDS,
				source: reward.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_REWARDS](reward),
			},
		};

		if (opts.isAddDataFlags) {
			out[SharedConsts.MODULE_NAME_FAKE].propDroppable = "reward";
			out[SharedConsts.MODULE_NAME_FAKE].filterValues = opts.filterValues;
		}

		return out;
	}

	static async pHasRewardSideLoadedEffects (actor, reward) {
		return (await this._pGetEffectsRawSideLoaded_(reward, this._SIDE_LOAD_OPTS))?.length > 0;
	}

	static async pGetRewardItemEffectTuples (actor, reward, sheetItem, {additionalData, img} = {}) {
		const effectsRaw = await this._pGetEffectsRawSideLoaded_(reward, {propBrew: "foundryReward", fnLoadJson: Vetools.pGetRewardSideData, propJson: "reward"});
		return UtilActiveEffects.getExpandedEffects(effectsRaw || [], {actor, sheetItem, parentName: reward.name, additionalData, img}, {isTuples: true});
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGetRewardSideData();
		return this._SIDE_DATA;
	}
}

export {DataConverterReward};
