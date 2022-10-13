import {MixinUserChooseImporter} from "./ImportList.js";
import {Vetools} from "./Vetools.js";
import {DataConverterFeat} from "./DataConverterFeat.js";
import {Config} from "./Config.js";
import {UtilList2} from "./UtilList2.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {ImportListFeature} from "./ImportListFeature.js";

class ImportListFeat extends ImportListFeature {
	static get ID () { return "feats"; }
	static get DISPLAY_NAME_TYPE_PLURAL () { return "Feats"; }
	static get _PROPS () { return ["feat"]; }

	static _ = this.registerImpl(this);

	// region External
	static init () {
		this._initCreateSheetItemHook({
			prop: "feat",
			importerName: "Feat",
		});
	}
	// endregion

	constructor (externalData, applicationOptsOverride, subclassOptsOverride) {
		applicationOptsOverride = applicationOptsOverride || {};
		subclassOptsOverride = subclassOptsOverride || {};
		super(
			{
				title: "Import Feats",
				...applicationOptsOverride,
			},
			externalData,
			{
				props: ImportListFeat._PROPS,
				dirsHomebrew: ["feat"],
				titleSearch: "feats",
				sidebarTab: "items",
				gameProp: "items",
				defaultFolderPath: ["Feats"],
				pageFilter: new PageFilterFeats(),
				page: UrlUtil.PG_FEATS,
				isPreviewable: true,
				isDedupable: true,
				configGroup: "importFeat",
				...subclassOptsOverride,
			},
			{
				titleLog: "feat",
			},
		);
	}

	async _pGetSources () {
		const argsShared = {pPostLoad: data => this.constructor._pPostLoad_addFauxOptionalfeatures(data)};
		return [
			new UtilDataSource.DataSourceUrl(
				Config.get("ui", "isStreamerMode") ? "SRD" : "5etools",
				Vetools.DATA_URL_FEATS,
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
					width: 4,
					field: "name",
				},
				{
					name: "Ability",
					width: 3,
					field: "ability",
				},
				{
					name: "Prerequisite",
					width: 3,
					field: "prerequisite",
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
					ability: it._slAbility,
					prerequisite: it._slPrereq,
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
					ability: it._slAbility,
					prerequisite: it._slPrereq,
					hash: UrlUtil.URL_TO_HASH_BUILDER[this._page](it),
				}),
				fnGetData: UtilList2.absorbFnGetData,
				fnBindListeners: it => this._isRadio
					? UtilList2.absorbFnBindListenersRadio(this._list, it)
					: UtilList2.absorbFnBindListeners(this._list, it),
			},
		);
	}

	static async _pGetEntityItem (actor, feat) { return DataConverterFeat.pGetFeatItem(feat, {isActorItem: !!actor}); }

	static async _pGetSideData (actor, feature) {
		return DataConverterFeat.pGetSideLoadedMatch(feature);
	}

	static async _pHasSideLoadedEffects (actor, feat) { return DataConverterFeat.pHasFeatSideLoadedEffects(actor, feat); }

	static async _pGetItemEffectTuples (actor, feat, importedEmbed, dataBuilderOpts) {
		return DataConverterFeat.pGetFeatItemEffectTuples(
			actor,
			feat,
			importedEmbed,
			{
				additionalData: {
					import: {chosenAbilityScoreIncrease: dataBuilderOpts.chosenAbilityScoreIncrease},
				},
			},
		);
	}

	_doPopulateFlags ({feature: feat, actor, importOpts, flags, flagsDnd5e}) {
		// (Note that these are now instead handled, generally, by active effects)
	}

	async _pMutActorUpdateFeature (feature, actUpdate, dataBuilderOpts) {
		await DataConverterFeat.pMutActorUpdateFeat(this._actor, actUpdate, feature, dataBuilderOpts);
	}

	_pImportEntry_pImportToDirectoryGeneric_pGetImportableData (it, getItemOpts) {
		return DataConverterFeat.pGetFeatItem(it, getItemOpts);
	}

	static async _pGetDereferencedFeatureItem (feature) {
		return DataConverterFeat.pGetDereferencedFeatFeatureItem(feature);
	}

	static async _pGetInitFeatureLoadeds (feature, {actor} = {}) {
		return DataConverterFeat.pGetInitFeatFeatureLoadeds(feature, {actor});
	}
}

/**
 * @mixes MixinUserChooseImporter
 */
ImportListFeat.UserChoose = class extends MixinUserChooseImporter(ImportListFeat) {
	constructor (externalData) {
		super(
			externalData,
			{
				title: "Select Feat",
			},
			{
				titleButtonRun: "Select",
			},
		);
	}
};

export {ImportListFeat};
