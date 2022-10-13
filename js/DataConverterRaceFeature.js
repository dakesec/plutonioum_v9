import {SharedConsts} from "../shared/SharedConsts.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {DataConverterFeature} from "./DataConverterFeature.js";

class DataConverterRaceFeature extends DataConverterFeature {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryRaceFeature",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "raceFeature",
		propsMatch: ["raceSource", "raceName", "source", "name"],
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/family-tree.svg`;

	/**
	 * @param raceFeature
	 * @param opts
	 * @param [opts.actor]
	 */
	static async pGetRaceFeatureItem (raceFeature, opts) {
		const img = await this._pGetCompendiumFeatureImage(raceFeature);

		const additionalData = await this._pGetDataSideLoaded(raceFeature);
		const additionalFlags = await this._pGetFlagsSideLoaded(raceFeature);

		const raceFeatureAlias = this.getFauxRaceFeaturesAlias(raceFeature);

		const additionalDataAlias = raceFeatureAlias ? await this._pGetDataSideLoaded(raceFeatureAlias) : null;
		const additionalFlagsAlias = raceFeatureAlias ? await this._pGetFlagsSideLoaded(raceFeatureAlias) : null;

		// Note that we do not pull side-loaded effects here, as they are applied by the race importer
		const srdData = await UtilCompendium.getSrdCompendiumEntity("raceFeature", raceFeature)
			|| (raceFeatureAlias ? (await UtilCompendium.getSrdCompendiumEntity("raceFeature", raceFeatureAlias)) : null);

		const effects = MiscUtil.copy(srdData?.effects || []);
		DataConverter.mutEffectsDisabledTransfer(effects, "importRace");

		return DataConverter.pGetItemActorPassive(
			raceFeature,
			{

				mode: "player",
				img,
				effects,
				fvttType: "feat",
				source: raceFeature.source,
				actor: opts.actor,
				foundryFlags: {
					[SharedConsts.MODULE_NAME_FAKE]: {
						page: "raceFeature",
						source: raceFeature.source,
						hash: UrlUtil.URL_TO_HASH_BUILDER["raceFeature"](raceFeature),
					},
				},
				additionalData: {...additionalDataAlias, ...additionalData},
				additionalFlags: {...additionalFlags, ...additionalFlagsAlias},
			},
		);
	}

	static getFauxRaceFeature (race, entry) {
		return {
			source: entry.source || race.source,
			raceName: race.name,
			raceSource: race.source,
			_raceBaseName: race._baseName,
			_raceBaseSource: race._baseSource,
			srd: !!(race.srd || race._baseSrd),
			basicRules: !!race.basicRules,
			page: entry.page ?? race.page,
			...MiscUtil.copy(entry),
			__prop: "raceFeature",
		};
	}

	/** Get the equivalent faux feature as though it were on the base race. */
	static getFauxRaceFeaturesAlias (raceFeature) {
		if (!raceFeature._raceBaseName && !raceFeature._raceBaseSource) return null;

		const out = {
			...MiscUtil.copy(raceFeature),
			source: raceFeature._raceBaseSource,
			raceName: raceFeature._raceBaseName,
			raceSource: raceFeature._raceBaseSource,
		};

		delete out._raceBaseName;
		delete out._raceBaseSource;

		return out;
	}

	static async pMutActorUpdateRaceFeature (actor, actorUpdate, raceFeature, dataBuilderOpts) {
		const sideData = await DataConverter._pGetSideLoadedMatch(raceFeature, this._SIDE_LOAD_OPTS);
		DataConverter.mutActorUpdate(actor, actorUpdate, raceFeature, {sideData});
	}

	static async _pGetCompendiumFeatureImage (feature) {
		const fromRaceFeature = await UtilCompendium.pGetCompendiumImage("raceFeature", feature, {fnGetAliases: this._getCompendiumFeatureAliases.bind(this), deepKeys: ["data.requirements"]});
		if (fromRaceFeature) return fromRaceFeature;

		return this._pGetSaveImagePath(
			{name: feature.raceName, source: feature.raceSource, srd: feature.srd},
			{propCompendium: "race"},
		);
	}

	static _getCompendiumFeatureAliases (feature) {
		if (!feature.raceName && !feature._raceBaseName) return [];
		if (!feature.name) return [];

		const out = [];

		out.push({
			name: feature.name,
			"data.requirements": feature.raceName,
		});

		// Add inverted race name
		const invertedName = PageFilterRaces.getInvertedName(feature.raceName);
		if (invertedName && invertedName !== feature.raceName) {
			out.push({
				name: feature.name,
				"data.requirements": invertedName,
			});
		}

		// Fall back on base race
		if (feature._raceBaseName) {
			out.push({
				name: feature.name,
				"data.requirements": feature._raceBaseName,
			});
		}

		return out;
	}

	static async pHasRaceFeatureSideLoadedEffects (actor, raceFeature) {
		return (await DataConverter._pGetEffectsRawSideLoaded_(raceFeature, this._SIDE_LOAD_OPTS))?.length > 0;
	}

	static async pGetRaceFeatureItemEffectTuples (actor, feature, sheetItem, {additionalData, img} = {}) {
		const effectsRaw = await DataConverter._pGetEffectsRawSideLoaded_(feature, this._SIDE_LOAD_OPTS);
		return UtilActiveEffects.getExpandedEffects(effectsRaw || [], {actor, sheetItem: sheetItem, parentName: feature.raceName, additionalData, img}, {isTuples: true});
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGetRaceSideData();
		return this._SIDE_DATA;
	}
}

export {DataConverterRaceFeature};
