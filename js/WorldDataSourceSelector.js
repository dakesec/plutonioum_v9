import {SharedConsts} from "../shared/SharedConsts.js";
import {Util} from "./Util.js";
import {ImportList} from "./ImportList.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {AppSourceSelectorMulti} from "./AppSourceSelectorMulti.js";
import {UtilWorldDataSourceSelector} from "./UtilWorldDataSourceSelector.js";

/**
 * Allows the GM to choose which sources should be available in source lists.
 */
class WorldDataSourceSelector extends Application {
	static APP_TITLE = "World Data Source Selector";

	constructor () {
		super(
			{
				title: WorldDataSourceSelector.APP_TITLE,
				template: `${SharedConsts.MODULE_LOCATION}/template/WorldDataSourceSelector.hbs`,
				width: 960,
				height: Util.getMaxWindowHeight(),
				resizable: true,
			},
		);

		this._comp = null;
	}

	activateListeners ($html) {
		super.activateListeners($html);

		this._pRender($html).then(null);
	}

	async _pRender ($html) {
		const $stgTop = $html.find(`[data-name="wrp-top"]`);
		const $stgLhs = $html.find(`[data-name="wrp-lhs"]`);
		const $stgRhs = $html.find(`[data-name="wrp-rhs"]`);
		const $stgBot = $html.find(`[data-name="wrp-bot"]`);

		const sourceLists = await this._pRender_pLoadSources();
		const savedState = UtilWorldDataSourceSelector.loadState();

		this._comp = new _WorldDataSourceSelectorComp({sourceLists, savedState});

		await this._comp.pRender({
			$stgTop,
			$stgBot,
			$stgLhs,
			$stgRhs,
		});
	}

	async _pRender_pLoadSources () {
		return (
			await [...ImportList.IMPLS.values()].pMap(async Impl => {
				const sources = (await (new Impl()).pGetSources({isApplyWorldDataSourceFilter: false}))
					.filter(({isWorldSelectable}) => isWorldSelectable);
				return new _SourceList({
					name: Impl.DISPLAY_NAME_TYPE_PLURAL,
					sources,
					propState: Impl.ID,
				});
			})
		).sort(SortUtil.ascSortLowerProp.bind(SortUtil, "name"));
	}
}

class _SourceList {
	constructor ({name, sources, propState}) {
		this.name = name;
		this.sources = sources;
		this.propState = propState;
	}
}

class _WorldDataSourceSelectorComp extends BaseComponent {
	static _Render = class {
		constructor () {
			this.lists = [];
			this.pageFilter = null;
		}
	};

	constructor ({sourceLists, savedState}) {
		super();

		this.__meta = {
			...sourceLists.mergeMap(({propState}) => ({[this._getProps(propState).propIsSectionVisible]: true})),
		};
		this._meta = this._getProxy("meta", this.__meta);

		this._sourceLists = sourceLists;

		if (savedState != null) this.setStateFrom(savedState);
	}

	_getProps (propState) {
		return {
			propIsSectionVisible: `${propState}_isSectionVisible`,
			propIsSectionCollapsed: `${propState}_isSectionCollapsed`,
		};
	}

	async pRender ({$stgTop, $stgLhs, $stgRhs, $stgBot}) {
		const render = new this.constructor._Render();
		this._pRender_top({render, $stgTop});
		this._pRender_lhs({render, $stgLhs});
		await this._pRender_pRhs({render, $stgRhs});
		this._pRender_bot({render, $stgBot});
	}

	_pRender_top ({render, $stgTop}) {
		const $btnExport = $(`<button class="btn btn-5et btn-xs"><i class="fas fa-file-export fa-fw"></i> Export Selection</button>`)
			.click(() => {
				DataUtil.userDownload(
					`${SharedConsts.MODULE_NAME}-world-data-source-selection`,
					this.getSaveableState(),
					{
						propVersion: "moduleVersion",
						fileType: "world-data-source-selection",
						valVersion: game.modules.get(SharedConsts.MODULE_NAME).data.version,
					},
				);
			});

		const $btnImport = $(`<button class="btn btn-5et btn-xs"><i class="fas fa-file-import fa-fw"></i> Import Selection</button>`)
			.click(async () => {
				const {jsons, errors} = await DataUtil.pUserUpload({
					expectedFileTypes: ["world-data-source-selection"],
					propVersion: "moduleVersion",
				});

				DataUtil.doHandleFileLoadErrorsGeneric(errors);

				if (!jsons?.length) return;

				this.setStateFrom(jsons[0]);

				await UtilWorldDataSourceSelector.pSaveState(this.getSaveableState());
			});

		const $btnResetAll = $(`<button class="btn btn-5et btn-xs ml-1" title="Reset All"><i class="fa fa-undo-alt mr-0"></i></button>`)
			.click(async () => {
				const isContinue = await InputUiUtil.pGetUserBoolean({
					title: "Reset All",
					htmlDescription: "Are you sure you want to reset your world data source selection?",
					textNo: "Cancel",
					textYes: "Continue",
				});
				if (!isContinue) return;

				this._proxyAssignSimple("state", this._getDefaultState(), true);
			});

		$$($stgTop.empty())`<div class="ve-flex-h-right w-100">
			<div class="btn-group ve-flex-vh-center">
				${$btnExport}
				${$btnImport}
			</div>
			${$btnResetAll}
		</div>
		<hr class="hr-2">`;
	}

	_pRender_lhs ({render, $stgLhs}) {
		const $cbAll = $(`<input type="checkbox">`)
			.prop("checked", true)
			.change(() => {
				const val = $cbAll.prop("checked");
				this._proxyAssignSimple("meta", this._sourceLists.mergeMap(({propState}) => ({[this._getProps(propState).propIsSectionVisible]: val})));
			});

		const $rows = this._sourceLists.map(({name, propState}) => {
			const {propIsSectionVisible} = this._getProps(propState);

			const $cbToggle = ComponentUiUtil.$getCbBool(this, propIsSectionVisible, {stateName: "meta"});

			return $$`<label class="split-v-center py-1 veapp__ele-hoverable">
				<div>${name}</div>
				${$cbToggle}
			</label>`.click(evt => {
		if (!evt.shiftKey) return;
		evt.stopPropagation();
		evt.preventDefault();

		const nxtState = this._sourceLists.mergeMap(({propState}) => ({[this._getProps(propState).propIsSectionVisible]: false}));
		nxtState[propIsSectionVisible] = true;
		this._proxyAssignSimple("meta", nxtState);
	});
		});

		$$($stgLhs.empty())`<div class="ve-flex-col h-100 w-100 overflow-y-auto">
			<label class="split-v-center py-1 veapp__ele-hoverable">
				<div>All</div>
				${$cbAll}
			</label>

			<hr class="hr-1">

			${$rows}
		</div>`;
	}

	async _pRender_pRhs ({render, $stgRhs}) {
		render.pageFilter = new AppSourceSelectorMulti.AppSourceSelectorAppFilter();

		const {
			$cbAll,
			$wrpFilterControls,
			$wrpMiniPills,
			$wrpBtnsSort,
			$list,
			$btnOpenFilter,
			$iptSearch,
			$btnReset,
			$btnToggleSummaryHidden,
		} = AppSourceSelectorMulti.$getFilterListElements();

		render.listMetas = this._sourceLists
			.map(({name, sources, propState}, ixSourceList) => {
				const {propIsSectionVisible, propIsSectionCollapsed} = this._getProps(propState);

				const $listSub = $$`<div class="flex-col w-100 min-h-0 smooth-scroll"></div>`;

				const $btnToggleExpanded = $(`<div class="clickable mr-2"></div>`)
					.click(() => {
						this._meta[propIsSectionCollapsed] = !this._meta[propIsSectionCollapsed];
					});
				const hkIsExpanded = () => {
					$listSub.toggleVe(!this._meta[propIsSectionCollapsed]);
					$btnToggleExpanded.text(this._meta[propIsSectionCollapsed] ? "[+]" : "[\u2013]");
				};
				this._addHook("meta", propIsSectionCollapsed, hkIsExpanded);
				hkIsExpanded();

				const $stgList = $$`<div class="ve-flex-col">
					<label class="split-v-center">
						<div class="py-1 bold">${name}</div>
						${$btnToggleExpanded}
					</label>
					${$listSub}
					<hr class="hr-0 mt-1">
				</div>`.appendTo($list);

				const list = new List({
					$iptSearch,
					$wrpList: $listSub,
					fnSort: UtilDataSource.sortListItems.bind(UtilDataSource),
				});

				if (!ixSourceList) SortUtil.initBtnSortHandlers($wrpBtnsSort, list);
				else SortUtil.initBtnSortHandlersAdditional($wrpBtnsSort, list);
				ListUiUtil.bindSelectAllCheckbox($cbAll, list);

				const hkAll = () => {
					const val = $cbAll.prop("checked");

					list.visibleItems.forEach(li => {
						if (!val) delete this._state[li.data.identifierWorld];
						else this._state[li.data.identifierWorld] = val;
					});
				};
				$cbAll.change(hkAll);

				sources.forEach((src, srcI) => {
					const listItem = AppSourceSelectorMulti.getListItem({
						pageFilter: render.pageFilter,
						list,
						src,
						srcI,
						fnOnClick: () => {
							this._state[src.identifierWorld] = listItem.data.cbSel.checked;
						},
						isSelected: this._state[src.identifierWorld],
					});

					const hk = () => {
						ListUiUtil.setCheckbox(listItem, {toVal: !!this._state[src.identifierWorld]});
					};
					this._addHookBase(src.identifierWorld, hk);

					list.addItem(listItem);
				});

				list.on("updated", () => $stgList.toggleVe(list.visibleItems.length));

				return {
					$stgList,
					list,
					sources,
					propIsSectionVisible,
				};
			});

		await render.pageFilter.pInitFilterBox({
			$iptSearch: render.$iptSearch,
			$btnReset,
			$btnOpen: $btnOpenFilter,
			$btnToggleSummaryHidden,
			$wrpMiniPills,
			namespace: `WorldDataSourceSelector.filter`,
		});

		$$($stgRhs)`
			${$wrpFilterControls}
			${$wrpMiniPills}
			${$wrpBtnsSort}
			${$list}
		`;

		render.listMetas.forEach(({list}) => list.init());

		render.pageFilter.trimState();
		render.pageFilter.filterBox.render();

		const handleFilterChange = () => {
			const f = render.pageFilter.filterBox.getValues();
			render.listMetas.forEach(({list, sources, propIsSectionVisible}) => {
				list.filter(li => this._meta[propIsSectionVisible] && render.pageFilter.toDisplay(f, sources[li.ix]));
			});
		};

		render.pageFilter.filterBox.on(
			FilterBox.EVNT_VALCHANGE,
			handleFilterChange,
		);

		render.listMetas.forEach(({propIsSectionVisible}) => {
			this._addHook("meta", propIsSectionVisible, handleFilterChange);
		});

		handleFilterChange();
	}

	_pRender_bot ({render, $stgBot}) {
		const $btnSave = $(`<button class="btn btn-5et btn-default w-100">Save</button>`)
			.click(async () => {
				await UtilWorldDataSourceSelector.pSaveState(this.getSaveableState());
			});

		$$($stgBot.empty())`<div class="ve-flex-v-center">
			${$btnSave}
		</div>`;
	}
}

export {WorldDataSourceSelector};
