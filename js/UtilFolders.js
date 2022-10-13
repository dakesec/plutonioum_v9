import {Util} from "./Util.js";

class UtilFolders {
	static async pCreateFoldersGetId ({folderType, folderIdRoot = null, folderNames, folderMetas, sorting = null}) {
		if (folderNames != null && folderMetas != null) throw new Error(`Only one of "folderNames" and "folderMetas" may be specified!`);
		if (folderMetas != null && sorting != null) throw new Error(`Only one of "folderMetas" and "sorting" may be specified!`);

		folderMetas = this._getFolderMetas({folderNames, folderMetas, sorting});

		try {
			await this._LOCK_FOLDER_CREATE.pLock();
			const out = await this._pGetCreateFolders_({folderType, folderIdRoot, folderMetas});
			void out;
			return out;
		} finally {
			this._LOCK_FOLDER_CREATE.unlock();
		}
	}

	static _getFolderMetas ({folderNames, folderMetas, sorting = null}) {
		folderMetas = folderMetas || folderNames.map((it, i) => ({
			name: it,
			color: null,
			description: null,
			flags: {},
			sort: 0,
			// Apply the sorting to the *last* folder only
			sorting: i === folderNames.length - 1 ? sorting || "a" : "a",
		}));

		folderMetas.forEach(it => it.name = `${it.name}`.trim() || " ");

		return folderMetas;
	}

	static async pFoldersGetId ({folderType, folderIdRoot = null, folderNames}) {
		const folderMetas = this._getFolderMetas({folderNames});

		return this._pGetCreateFolders_({folderMetas, folderIdRoot, isCreate: false});
	}

	static async _pGetCreateFolders_ ({folderType, folderIdRoot, folderMetas, isCreate = true}) {
		if (!folderMetas?.length || !folderType) return null;

		const stack = [];
		if (folderIdRoot != null) {
			const folder = CONFIG.Folder.collection.instance.get(folderIdRoot);
			if (folder) stack.push(folder);
		}

		for (let i = 0; i < folderMetas.length; ++i) {
			const {name} = folderMetas[i];

			const parentId = stack.length ? stack.last().id : null;

			const folder = this._pCreateFolders_findFolder({folderType, folderStack: stack, name, parentId});
			if (folder) {
				stack.push(folder);
				continue;
			}

			// If we are in no-create mode and we can't find the next folder, bail out, and return `null`
			if (!isCreate) {
				return null;
			}

			// FIXME(Future) unfortunately, Foundry (as of 2022-02-18) does not support the creation of folders by non-GMs.
			//   Bail out and use whatever we have.
			if (!Util.Fvtt.canUserCreateFolders()) {
				break;
			}

			// create a new folder
			const folderData = {
				...folderMetas[i],
				parent: parentId,
				type: folderType,
			};
			const nuFolder = await Folder.create(folderData, {});
			stack.push(nuFolder);
		}

		if (stack.length) return stack.last().id;
		return null;
	}

	static _pCreateFolders_findFolder ({folderType, folderStack, name, parentId}) {
		const matches = CONFIG.Folder.collection.instance.contents.filter(it => {
			const isNameMatch = it.data.name === `${name}`;
			const isTypeMatch = it.data.type === folderType;
			const isParentMatch = parentId ? it.data.parent === parentId : it.data.parent == null;
			return isNameMatch && isTypeMatch && isParentMatch;
		});

		if (matches.length > 1) {
			const msg = `Ambiguous folder path! Found multiple folders for ${folderStack.map(it => it.data.name).join(" > ")}`;
			ui.notifications.error(msg);
			throw new Error(msg);
		}
		if (matches.length) return matches[0];
		return null;
	}
}
UtilFolders._LOCK_FOLDER_CREATE = new VeLock();

export {UtilFolders};
