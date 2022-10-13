import {MixinUserChooseImporter} from "./ImportList.js";
import {Vetools} from "./Vetools.js";
import {Config} from "./Config.js";
import {UtilList2} from "./UtilList2.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {PageFilterClassFeatures} from "./PageFilterClassFeatures.js";
import {DataConverterClassSubclassFeature} from "./DataConverterClassSubclassFeature.js";
import {ImportListFeature} from "./ImportListFeature.js";

class ImportListClassFeature extends ImportListFeature {
	static get ID () { return "classes-subclasses-features"; }
	static get DISPLAY_NAME_TYPE_PLURAL () { return "Class & Subclass Features"; }

	static _ = this.registerImpl(this);

	static get _PROPS () { return ["classFeature", "subclassFeature"]; }

	// region External
	static init () {
		this._initCreateSheetItemHook({
			prop: "classFeature",
			importerName: "Class Feature",
		});
		this._initCreateSheetItemHook({
			prop: "subclassFeature",
			importerName: "Subclass Feature",
		});
	}
	// endregion

	constructor (externalData, applicationOptsOverride, subclassOptsOverride) {
		applicationOptsOverride = applicationOptsOverride || {};
		subclassOptsOverride = subclassOptsOverride || {};
		super(
			{
				title: "Import Class & Subclass Features",
				...applicationOptsOverride,
			},
			externalData,
			{
				props: ImportListClassFeature._PROPS,
				dirsHomebrew: ["classFeature", "subclassFeature"],
				titleSearch: "class and subclass features",
				sidebarTab: "items",
				gameProp: "items",
				defaultFolderPath: ["Class & Subclass Features"],
				fnListSort: PageFilterClassFeatures.sortClassFeatures,
				listInitialSortBy: "className",
				pageFilter: new PageFilterClassFeatures(),
				page: UrlUtil.PG_CLASS_SUBCLASS_FEATURES,
				isPreviewable: true,
				isDedupable: true,
				configGroup: "importClassSubclassFeature",
				...subclassOptsOverride,
			},
			{
				titleLog: "class/subclass feature",
			},
		);

		this._contentDereferenced = null;
	}

	async _pGetSources () {
		return [
			new UtilDataSource.DataSourceSpecial(
				Config.get("ui", "isStreamerMode") ? "SRD" : "5etools",
				Vetools.pGetClassSubclassFeatures,
				{
					cacheKey: "5etools-class-subclass-features",
					filterTypes: [UtilDataSource.SOURCE_TYP_OFFICIAL_ALL],
					isDefault: true,
					pPostLoad: loadedData => this.constructor._pPostLoad(loadedData),
				},
			),
			new UtilDataSource.DataSourceUrl(
				"Custom URL",
				"",
				{
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
					pPostLoad: loadedData => this.constructor._pPostLoad(loadedData),
				},
			),
			new UtilDataSource.DataSourceFile(
				"Upload File",
				{
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
					pPostLoad: loadedData => this.constructor._pPostLoad(loadedData),
				},
			),
			...(await this._pGetSourcesHomebrew({pPostLoad: loadedData => this.constructor._pPostLoad(loadedData)})),
		];
	}

	static async _pPostLoad (loadedData) {
		const out = {};

		for (let [k, arr] of Object.entries(loadedData)) {
			if (!this._PROPS.includes(k)) continue;

			arr = arr.filter(it => it.name.toLowerCase() !== "ability score improvement");

			// (N.b.: this is a performance hog)
			const outArr = [];
			for (const feature of arr) {
				const loaded = await this._pGetInitFeatureLoadeds(feature);
				if (!loaded || loaded.isIgnored) continue;
				outArr.push(feature);
			}

			out[k] = outArr;
		}

		return out;
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
					name: "Class",
					width: 2,
					field: "className",
				},
				{
					name: "Subclass",
					width: 2,
					field: "subclassShortName",
				},
				{
					name: "Level",
					width: 1,
					field: "level",
					rowClassName: "text-center",
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
					className: it.className,
					subclassShortName: it.subclassShortName,
					level: it.level,
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
					className: it.className,
					subclassShortName: it.subclassShortName || "",
					level: it.level,
					hash: UrlUtil.URL_TO_HASH_BUILDER[this._page](it),
				}),
				fnGetData: UtilList2.absorbFnGetData,
				fnBindListeners: it => this._isRadio
					? UtilList2.absorbFnBindListenersRadio(this._list, it)
					: UtilList2.absorbFnBindListeners(this._list, it),
			},
		);
	}

	async pSetContent (val) {
		await super.pSetContent(val);
		this._contentDereferenced = await this._content
			.pMap(feature => DataConverterClassSubclassFeature.pGetDereferencedClassSubclassFeatureItem(feature));
	}

	_renderInner_initPreviewButton (item, btnShowHidePreview) {
		ListUiUtil.bindPreviewButton(this._page, this._contentDereferenced, item, btnShowHidePreview);
	}

	static async _pGetEntityItem (actor, feature) {
		return DataConverterClassSubclassFeature.pGetClassSubclassFeatureItem(feature, {actor});
	}

	static async _pGetSideData (actor, feature) {
		return DataConverterClassSubclassFeature.pGetSideLoadedMatch(feature);
	}

	static async _pHasSideLoadedEffects (actor, feature) {
		return DataConverterClassSubclassFeature.pHasClassSubclassSideLoadedEffects(actor, feature);
	}

	static async _pGetItemEffectTuples (actor, feature, importedEmbed, dataBuilderOpts) {
		return DataConverterClassSubclassFeature.pGetClassSubclassFeatureItemEffectTuples(
			actor,
			feature,
			importedEmbed,
			{
				additionalData: {
					import: {chosenAbilityScoreIncrease: dataBuilderOpts.chosenAbilityScoreIncrease},
				},
			},
		);
	}

	async _pMutActorUpdateFeature (feature, actUpdate, dataBuilderOpts) {
		await DataConverterClassSubclassFeature.pMutActorUpdateClassSubclassFeatureItem(this._actor, actUpdate, feature, dataBuilderOpts);
	}

	_pImportEntry_pImportToDirectoryGeneric_pGetImportableData (it, getItemOpts) {
		return DataConverterClassSubclassFeature.pGetClassSubclassFeatureItem(it, {actor: this._actor, ...getItemOpts});
	}

	static async _pGetDereferencedFeatureItem (feature) {
		return DataConverterClassSubclassFeature.pGetDereferencedClassSubclassFeatureItem(feature);
	}

	static async _pGetInitFeatureLoadeds (feature, {actor} = {}) {
		return DataConverterClassSubclassFeature.pGetInitClassSubclassFeatureLoadeds(feature, {actor});
	}

	_getAsTag (listItem) {
		const tag = Parser.getPropTag(this._content[listItem.ix].__prop);
		const ptUid = this._getUid(this._content[listItem.ix]);
		return `@${tag}[${ptUid}]`;
	}

	_getUid (feature) {
		switch (feature.__prop) {
			case "classFeature": return DataUtil.class.packUidClassFeature(feature);
			case "subclassFeature": return DataUtil.class.packUidSubclassFeature(feature);
			default: throw new Error(`Unhandled feature prop "${feature.__prop}"`);
		}
	}
}

/**
 * @mixes MixinUserChooseImporter
 */
ImportListClassFeature.UserChoose = class extends MixinUserChooseImporter(ImportListClassFeature) {
	constructor (externalData) {
		super(
			externalData,
			{
				title: "Select Class or Subclass Feature",
			},
			{
				titleButtonRun: "Select",
			},
		);
	}
};

export {ImportListClassFeature};
