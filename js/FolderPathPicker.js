import {SharedConsts} from "../shared/SharedConsts.js";
import {UtilApplications} from "./UtilApplications.js";

class FolderPathPicker extends Application {
	constructor ({documentType}) {
		super({
			title: "Select Folder",
			template: `${SharedConsts.MODULE_LOCATION}/template/_Generic.hbs`,
			width: 600,
			resizable: true,
		});

		this._documentType = documentType;
	}

	activateListeners ($html) {
		super.activateListeners($html);

		this._activateListeners_initBtnRun($html);
		this._activateListeners_pInitListAndFilters($html);
	}

	_activateListeners_initBtnRun ($html) {
		const $cbPruneAuto = $html.find(`[name="cb-prune-auto"]`);
		$html.find(`[name="btn-run"]`).click(() => this._pDoDelete($cbPruneAuto));
	}

	getData () {
		this._rows = this._rows = this._mapEntitiesToRows();

		return {
			...super.getData(),
			titleSearch: `${this._collectionName}s`,
			rows: this._rows,
			isPrunable: this._folderType != null,
		};
	}

	_mapEntitiesToRows () {
		return game.folders.contents
			.filter(it => it.data.type === this._documentType)
			.map((it, ix) => {
				const path = UtilApplications.getFolderPath(it, {isAddTrailingSlash: true});
				return {
					path,
					name: it.name,
					displayName: `${path || ""}${it.name}`,
					id: it.id,
					ix,
				};
			})
			.sort(BaseCollectionTool._sortNamePathRows);
	}
}

export {FolderPathPicker};
