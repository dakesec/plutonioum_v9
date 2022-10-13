import {Vetools} from "./Vetools.js";
import {Config} from "./Config.js";
import {UtilList2} from "./UtilList2.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {ImportListFeature} from "./ImportListFeature.js";
import {Charactermancer_Background_Features} from "./UtilCharactermancerBackground.js";
import {DataConverterBackgroundFeature} from "./DataConverterBackgroundFeature.js";

class PageFilterBackgroundFeature extends PageFilter {
	constructor () {
		super();
		this._miscFilter = new Filter({
			header: "Miscellaneous",
			items: ["SRD", "Basic Rules"],
			isMiscFilter: true,
		});
	}

	static mutateForFilters (ent) {
		ent._fMisc = ent.srd ? ["SRD"] : [];
		if (ent.basicRules) ent._fMisc.push("Basic Rules");
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

class ImportListBackgroundFeature extends ImportListFeature {
	static get ID () { return "background-features"; }
	static get DISPLAY_NAME_TYPE_PLURAL () { return "Background Features"; }
	static get _PROPS () { return ["backgroundFeature"]; }

	static _ = this.registerImpl(this);

	constructor (externalData = {}, applicationOptsOverride = {}, subclassOptsOverride = {}) {
		super(
			{
				title: "Import Background Features",
				...applicationOptsOverride,
			},
			externalData,
			{
				props: ImportListBackgroundFeature._PROPS,
				dirsHomebrew: ["background"],
				titleSearch: "background features",
				sidebarTab: "items",
				gameProp: "items",
				defaultFolderPath: ["Background Features"],
				pageFilter: new PageFilterBackgroundFeature(),
				page: "backgroundFeature",
				isPreviewable: true,
				isDedupable: true,
				configGroup: "importBackgroundFeature",
				...subclassOptsOverride,
			},
			{
				titleLog: "background feature",
			},
		);
	}

	static async _pPostLoad_getFeaturesFromBackgrounds (data) {
		const out = {backgroundFeature: []};

		for (const bg of data.background || []) {
			// This copies the entry
			const features = Charactermancer_Background_Features.getFeatureEntries(bg);
			out.backgroundFeature.push(...features);
		}

		return out;
	}

	async _pGetSources () {
		const argsShared = {pPostLoad: (data) => this.constructor._pPostLoad_getFeaturesFromBackgrounds(data)};
		return [
			new UtilDataSource.DataSourceUrl(
				Config.get("ui", "isStreamerMode") ? "SRD" : "5etools",
				Vetools.DATA_URL_BACKGROUNDS,
				{
					...argsShared,
					filterTypes: [UtilDataSource.SOURCE_TYP_OFFICIAL_ALL],
					isDefault: true,
				},
			),
			new UtilDataSource.DataSourceUrl(
				"Custom URL",
				"",
				{
					...argsShared,
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			new UtilDataSource.DataSourceFile(
				"Upload File",
				{
					...argsShared,
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			...(await this._pGetSourcesHomebrew({...argsShared})),
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
					name: "Background",
					width: 5,
					field: "backgroundName",
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
					backgroundName: it.backgroundName,
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
					backgroundName: it.backgroundName,
					hash: UrlUtil.URL_TO_HASH_BUILDER[this._page](it),
				}),
				fnGetData: UtilList2.absorbFnGetData,
				fnBindListeners: it => this._isRadio
					? UtilList2.absorbFnBindListenersRadio(this._list, it)
					: UtilList2.absorbFnBindListeners(this._list, it),
			},
		);
	}

	static async _pGetEntityItem (actor, feature) { return DataConverterBackgroundFeature.pGetBackgroundFeatureItem(feature, {actor}); }

	static async _pGetSideData (actor, feature) {
		return DataConverterBackgroundFeature.pGetSideLoadedMatch(feature);
	}

	static async _pHasSideLoadedEffects (actor, feature) { return DataConverterBackgroundFeature.pHasBackgroundFeatureSideLoadedEffects(actor, feature); }

	static async _pGetItemEffectTuples (actor, feature, importedEmbed, dataBuilderOpts) {
		return DataConverterBackgroundFeature.pGetBackgroundFeatureItemEffectTuples(
			actor,
			feature,
			importedEmbed,
		);
	}

	async _pMutActorUpdateFeature (feature, actUpdate, dataBuilderOpts) {
		await DataConverterBackgroundFeature.pMutActorUpdateBackgroundFeature(this._actor, actUpdate, feature, dataBuilderOpts);
	}

	_pImportEntry_pImportToDirectoryGeneric_pGetImportableData (it, getItemOpts) {
		return DataConverterBackgroundFeature.pGetBackgroundFeatureItem(it, getItemOpts);
	}

	static async _pGetDereferencedFeatureItem (feature) {
		return MiscUtil.copy(feature);
	}

	static async _pGetInitFeatureLoadeds (feature, {actor} = {}) {
		const hash = UrlUtil.URL_TO_HASH_BUILDER["backgroundFeature"](feature);
		return {
			hash,
			loadeds: [
				{
					hash,
					page: "backgroundFeature",
					source: feature.source,
					entity: feature,
					type: "backgroundFeature",
				},
			],
			name: feature.name,
			backgroundFeature: `${feature.name}|${feature.backgroundName}|${feature.backgroundSource}|${feature.source}`,
			source: feature.source,
		};
	}
}

export {ImportListBackgroundFeature};
