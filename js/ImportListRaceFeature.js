import {Vetools} from "./Vetools.js";
import {Config} from "./Config.js";
import {UtilList2} from "./UtilList2.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {ImportListFeature} from "./ImportListFeature.js";
import {DataConverterRaceFeature} from "./DataConverterRaceFeature.js";
import {Charactermancer_Race_Util} from "./UtilCharactermancerRace.js";

class PageFilterRaceFeature extends PageFilter {
	constructor () {
		super();
		this._miscFilter = new Filter({
			header: "Miscellaneous",
			items: ["Generic Feature", "SRD", "Basic Rules"],
			deselFn: (it) => it === "Generic Feature",
			isMiscFilter: true,
		});
	}

	static _GENERIC_NAMES = new Set([
		"Age",
		"Alignment",
		"Creature Type",
		"Darkvision",
		"Language",
		"Languages",
		"Size",
		"Superior Darkvision",
	].map(it => it.toLowerCase()));
	static _isGenericName (name) {
		return name && this._GENERIC_NAMES.has(name.toLowerCase());
	}

	static mutateForFilters (ent) {
		ent._fMisc = ent.srd ? ["SRD"] : [];
		if (ent.basicRules) ent._fMisc.push("Basic Rules");
		if (this._isGenericName(ent.name)) ent._fMisc.push("Generic Feature");
	}

	addToFilters (it, isExcluded) {
		if (isExcluded) return;

		this._sourceFilter.addItem(it.source);
		this._miscFilter.addItem(it._fMisc);
	}

	async _pPopulateBoxOptions (opts) {
		opts.filters = [
			this._sourceFilter,
			this._miscFilter,
		];
	}

	toDisplay (values, it) {
		return this._filterBox.toDisplay(
			values,
			it.source,
			it._fMisc,
		);
	}
}

class ImportListRaceFeature extends ImportListFeature {
	static get ID () { return "race-and-subrace-features"; }
	static get DISPLAY_NAME_TYPE_PLURAL () { return "Race & Subrace Features"; }
	static get _PROPS () { return ["raceFeature"]; }

	static _ = this.registerImpl(this);

	constructor (externalData = {}, applicationOptsOverride = {}, subclassOptsOverride = {}) {
		super(
			{
				title: "Import Race Features",
				...applicationOptsOverride,
			},
			externalData,
			{
				props: ImportListRaceFeature._PROPS,
				dirsHomebrew: ["race"],
				titleSearch: "race features",
				sidebarTab: "items",
				gameProp: "items",
				defaultFolderPath: ["Race Features"],
				pageFilter: new PageFilterRaceFeature(),
				page: "raceFeature",
				isPreviewable: true,
				isDedupable: true,
				configGroup: "importRaceFeature",
				...subclassOptsOverride,
			},
			{
				titleLog: "race feature",
			},
		);
	}

	static async _pPostLoad_getAllBrewFeaturesFromRaces (data) {
		const raceData = await Charactermancer_Race_Util.pPostLoadBrew(data);
		return this._pPostLoad_getFeaturesFromRaces(raceData);
	}

	static async _pPostLoad_getFeaturesFromRaces (data) {
		const out = {raceFeature: []};

		for (const race of data.race || []) {
			// This copies the entry
			(race.entries || [])
				.filter(it => it.name && it.entries)
				.forEach(ent => out.raceFeature.push(DataConverterRaceFeature.getFauxRaceFeature(race, ent)));
		}

		return out;
	}

	async _pGetSources () {
		const nonVetoolsOpts = {pPostLoad: (data) => this.constructor._pPostLoad_getAllBrewFeaturesFromRaces(data)};
		return [
			new UtilDataSource.DataSourceSpecial(
				Config.get("ui", "isStreamerMode") ? "SRD" : "5etools",
				Vetools.pGetRaces.bind(Vetools),
				{
					pPostLoad: (data) => this.constructor._pPostLoad_getFeaturesFromRaces(data),
					cacheKey: "5etools-race-features",
					filterTypes: [UtilDataSource.SOURCE_TYP_OFFICIAL_ALL],
					isDefault: true,
				},
			),
			new UtilDataSource.DataSourceUrl(
				"Custom URL",
				"",
				{
					...nonVetoolsOpts,
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			new UtilDataSource.DataSourceFile(
				"Upload File",
				{
					...nonVetoolsOpts,
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			...(await this._pGetSourcesHomebrew({...nonVetoolsOpts})),
		];
	}

	getData () {
		return {
			...super.getData(),
			cols: [
				{
					name: "Name",
					width: 5,
					field: "name",
				},
				{
					name: "Race",
					width: 5,
					field: "raceName",
				},
				{
					name: "Source",
					width: 1,
					field: "source",
					titleProp: "sourceLong",
					displayProp: "sourceShort",
					classNameProp: "sourceClassName",
					styleProp: "sourceStyle",
					rowClassName: "text-center",
				},
			],
			rows: this._content.map((it, ix) => {
				this._pageFilter.constructor.mutateForFilters(it);

				return {
					name: it.name,
					raceName: it.raceName,
					source: it.source,
					sourceShort: Parser.sourceJsonToAbv(it.source),
					sourceLong: Parser.sourceJsonToFull(it.source),
					sourceClassName: Parser.sourceJsonToColor(it.source),
					sourceStyle: BrewUtil2.sourceJsonToStylePart(it.source),
					ix,
				};
			}),
		};
	}

	_renderInner_absorbListItems () {
		this._list.doAbsorbItems(
			this._content,
			{
				fnGetName: it => it.name,
				// values used for sorting/search
				fnGetValues: it => ({
					source: it.source,
					raceName: it.raceName,
					hash: UrlUtil.URL_TO_HASH_BUILDER[this._page](it),
				}),
				fnGetData: UtilList2.absorbFnGetData,
				fnBindListeners: it => this._isRadio
					? UtilList2.absorbFnBindListenersRadio(this._list, it)
					: UtilList2.absorbFnBindListeners(this._list, it),
			},
		);
	}

	static async _pGetEntityItem (actor, feature) { return DataConverterRaceFeature.pGetRaceFeatureItem(feature, {actor}); }

	static async _pGetSideData (actor, feature) {
		return DataConverterRaceFeature.pGetSideLoadedMatch(feature);
	}

	static async _pHasSideLoadedEffects (actor, feature) { return DataConverterRaceFeature.pHasRaceFeatureSideLoadedEffects(actor, feature); }

	static async _pGetItemEffectTuples (actor, feature, importedEmbed, dataBuilderOpts) {
		return DataConverterRaceFeature.pGetRaceFeatureItemEffectTuples(
			actor,
			feature,
			importedEmbed,
		);
	}

	async _pMutActorUpdateFeature (feature, actUpdate, dataBuilderOpts) {
		await DataConverterRaceFeature.pMutActorUpdateRaceFeature(this._actor, actUpdate, feature, dataBuilderOpts);
	}

	_pImportEntry_pImportToDirectoryGeneric_pGetImportableData (it, getItemOpts) {
		return DataConverterRaceFeature.pGetRaceFeatureItem(it, getItemOpts);
	}

	static async _pGetDereferencedFeatureItem (feature) {
		return MiscUtil.copy(feature);
	}

	static async _pGetInitFeatureLoadeds (feature, {actor} = {}) {
		const hash = UrlUtil.URL_TO_HASH_BUILDER["raceFeature"](feature);
		return {
			hash,
			loadeds: [
				{
					hash,
					page: "raceFeature",
					source: feature.source,
					entity: feature,
					type: "raceFeature",
				},
			],
			name: feature.name,
			raceFeature: `${feature.name}|${feature.raceName}|${feature.raceSource}|${feature.source}`,
			source: feature.source,
		};
	}
}

export {ImportListRaceFeature};
