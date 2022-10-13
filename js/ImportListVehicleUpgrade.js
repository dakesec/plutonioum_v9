import {Vetools} from "./Vetools.js";
import {Config} from "./Config.js";
import {UtilList2} from "./UtilList2.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {DataConverterVehicleUpgrade} from "./DataConverterVehicleUpgrade.js";
import {ImportListFeature} from "./ImportListFeature.js";

class ImportListVehicleUpgrade extends ImportListFeature {
	static get ID () { return "vehicle-upgrades"; }
	static get DISPLAY_NAME_TYPE_PLURAL () { return "Vehicle Upgrades"; }
	static get _PROPS () { return ["vehicleUpgrade"]; }

	static _ = this.registerImpl(this);

	// region External
	static init () {
		this._initCreateSheetItemHook({
			prop: "vehicleUpgrade",
			importerName: "Vehicle Upgrades",
		});
	}
	// endregion

	constructor (externalData = {}, applicationOptsOverride = {}, subclassOptsOverride = {}) {
		super(
			{
				title: "Import Vehicle Upgrades",
				...applicationOptsOverride,
			},
			externalData,
			{
				props: ImportListVehicleUpgrade._PROPS,
				dirsHomebrew: ["vehicleUpgrade"],
				titleSearch: "vehicle upgrades",
				sidebarTab: "items",
				gameProp: "items",
				defaultFolderPath: ["Vehicles Upgrades"],
				pageFilter: new PageFilterVehicles(),
				page: UrlUtil.PG_VEHICLES,
				isPreviewable: true,
				isDedupable: true,
				configGroup: "importVehicleUpgrade",
				...subclassOptsOverride,
			},
			{
				titleLog: "vehicle upgrade",
			},
		);
	}

	async _pGetSources () {
		return [
			new UtilDataSource.DataSourceUrl(
				Config.get("ui", "isStreamerMode") ? "SRD" : "5etools",
				Vetools.DATA_URL_VEHICLES,
				{
					filterTypes: [UtilDataSource.SOURCE_TYP_OFFICIAL_ALL],
					isDefault: true,
				},
			),
			new UtilDataSource.DataSourceUrl(
				"Custom URL",
				"",
				{
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			new UtilDataSource.DataSourceFile(
				"Upload File",
				{
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			...(await this._pGetSourcesHomebrew()),
		];
	}

	getData () {
		return {
			...super.getData(),
			cols: [
				{
					name: "Name",
					width: 8,
					field: "name",
				},
				{
					name: "Type",
					width: 2,
					field: "type",
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
					type: it.upgradeType,
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
					type: it.upgradeType,
					hash: UrlUtil.URL_TO_HASH_BUILDER[this._page](it),
				}),
				fnGetData: UtilList2.absorbFnGetData,
				fnBindListeners: it => this._isRadio
					? UtilList2.absorbFnBindListenersRadio(this._list, it)
					: UtilList2.absorbFnBindListeners(this._list, it),
			},
		);
	}

	static async _pGetEntityItem (actor, feature) { return DataConverterVehicleUpgrade.pGetVehicleUpgradeItem(feature, {actor}); }

	static async _pGetSideData (actor, feature) {
		return DataConverterVehicleUpgrade.pGetSideLoadedMatch(feature);
	}

	static async _pHasSideLoadedEffects (actor, feature) { return DataConverterVehicleUpgrade.pHasVehicleUpgradeSideLoadedEffects(actor, feature); }

	static async _pGetItemEffectTuples (actor, feature, importedEmbed, dataBuilderOpts) {
		return DataConverterVehicleUpgrade.pGetVehicleUpgradeItemEffectTuples(
			actor,
			feature,
			importedEmbed,
		);
	}

	async _pMutActorUpdateFeature (it, actUpdate, dataBuilderOpts) {
		await DataConverterVehicleUpgrade.pMutActorUpdateVehicleUpgrade(this._actor, actUpdate, it, dataBuilderOpts);
	}

	_pImportEntry_pImportToDirectoryGeneric_pGetImportableData (it, getItemOpts) {
		return DataConverterVehicleUpgrade.pGetVehicleUpgradeItem(it, getItemOpts);
	}

	static async _pGetDereferencedFeatureItem (feature) {
		return DataConverterVehicleUpgrade.pGetDereferencedVehicleUpgradeFeatureItem(feature);
	}

	static async _pGetInitFeatureLoadeds (feature, {actor} = {}) {
		return DataConverterVehicleUpgrade.pGetInitVehicleUpgradeFeatureLoadeds(feature, {actor});
	}
}

export {ImportListVehicleUpgrade};
