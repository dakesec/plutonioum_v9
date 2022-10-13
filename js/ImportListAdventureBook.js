import {ImportedDocument, ImportList, ImportSummary} from "./ImportList.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Util, LGT} from "./Util.js";
import {ImportListCreature} from "./ImportListCreature.js";
import {ImportListSpell} from "./ImportListSpell.js";
import {UtilApplications} from "./UtilApplications.js";
import {ImportListItem} from "./ImportListItem.js";
import {ImportListRollableTable} from "./ImportListRollableTable.js";
import {DataConverter} from "./DataConverter.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {ImportListVariantRule} from "./ImportListVariantRule.js";
import {ImportListVehicleUpgrade} from "./ImportListVehicleUpgrade.js";
import {Config} from "./Config.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilFolders} from "./UtilFolders.js";
import {UtilDocuments} from "./UtilDocuments.js";
import {UtilAdventureBook} from "./UtilAdventureBook.js";

class ImportListAdventureBook extends ImportList {
	static get FOLDER_TYPE () { return "JournalEntry"; }

	/**
	 * @param applicationOpts
	 * @param externalData
	 * @param subclassOpts
	 * @param subSubclassOpts
	 * @param subSubclassOpts.fnGetIndex
	 * @param subSubclassOpts.dataProp
	 * @param subSubclassOpts.brewDataProp
	 * @param subSubclassOpts.title
	 */
	constructor (applicationOpts, externalData, subclassOpts, subSubclassOpts) {
		super(
			{
				title: applicationOpts.title,
				template: `${SharedConsts.MODULE_LOCATION}/template/ImportListAdventureBook.hbs`,
				width: 480,
				height: Util.getMaxWindowHeight(640),
				resizable: true,
			},
			externalData,
			{
				...subclassOpts,
				sidebarTab: "journal",
				gameProp: "journal",
				isNonCacheableInstance: true,
			},
		);

		this._fnGetIndex = subSubclassOpts.fnGetIndex;
		this._dataProp = subSubclassOpts.dataProp;
		this._brewDataProp = subSubclassOpts.brewDataProp;
		this._title = subSubclassOpts.title;

		// local fields
		this._availableEntities = null;
		this._availableInlineData = null;
		this._tagCbMetas = null;
		this._imageGroupCbMetas = null;
		this._availableMaps = {};
		this._entryIdToMap = {};
		this._entryIdToName = {};
	}

	// Only ever allow a single adventure/book to be imported in one instance
	get isRadio () { return true; }

	async _pGetSources () {
		const index = await this._fnGetIndex();

		const data = index[this._dataProp]
			.sort((a, b) => SortUtil.ascSortDate(b._pubDate, a._pubDate) || SortUtil.ascSortLower(a.name, b.name));

		return [
			...data.map(it => new UtilDataSource.DataSourceUrl(
				it.name,
				it._url,
				{
					pPostLoad: this._postLoadVetools.bind(this),
					userData: it,
					filterTypes: [UtilDataSource.SOURCE_TYP_OFFICIAL_SINGLE],
					source: it.source,
				}),
			),
			new UtilDataSource.DataSourceUrl(
				"Custom URL",
				"",
				{
					pPostLoad: this._pPostLoadOther.bind(this),
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			new UtilDataSource.DataSourceFile(
				"Upload File",
				{
					pPostLoad: this._pPostLoadOther.bind(this),
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			...(await this._pGetSourcesHomebrew({pPostLoad: this._pPostLoadOther.bind(this)})),
		];
	}

	_postLoadVetools (data, userData) {
		data = MiscUtil.copy(data);
		data._contentMetadata = MiscUtil.copy(userData);
		return data;
	}

	async _pPostLoadOther (data) {
		if (!data[this._dataProp] || !data[this._brewDataProp]) {
			ui.notifications.error(`File did not contain importable data\u2014one of "${this._dataProp}" and "${this._brewDataProp}" was missing!`);
			return null;
		}

		data = MiscUtil.copy(data);

		const importableTuples = data[this._dataProp].map(head => {
			const body = data[this._brewDataProp].find(it => it.id === head.id);
			if (!body) return null;
			return {
				head,
				body: body.data,
			};
		}).filter(Boolean);

		if (!importableTuples.length) {
			ui.notifications.error(`File did not contain importable data\u2014could not link any "${this._dataProp}" and "${this._brewDataProp}" items together!`);
			return null;
		}

		let chosenTuple;
		if (importableTuples.length === 1) chosenTuple = importableTuples[0];
		else {
			const chosenId = await InputUiUtil.pGetUserEnum({
				values: importableTuples.map(it => it.head.id),
				fnDisplay: value => {
					const indexItem = importableTuples.find(it => it.head.id === value);
					return `${indexItem.head.name} (${Parser.sourceJsonToAbv(indexItem.head.source)})`;
				},
				title: `Choose ${this._title}`,
				default: 0,
				isAllowNull: false,
				isResolveItem: true,
			});

			if (chosenId == null) return null;

			chosenTuple = importableTuples.find(it => it.head.id === chosenId);
		}

		const headContents = MiscUtil.get(chosenTuple, "head", "contents");
		const bodyData = MiscUtil.get(chosenTuple, "body");
		if (!headContents || !bodyData) {
			ui.notifications.error(`Could not import\u2014one of "${this._dataProp}[].contents" and "${this._brewDataProp}[].data" was missing!`);
			return null;
		}

		if (headContents.length !== bodyData.length) {
			ui.notifications.error(`Could not import\u2014header and chapter counts differed!`);
			return null;
		}

		return {
			_contentMetadata: chosenTuple.head,
			data: chosenTuple.body,
		};
	}

	getFolderPathMeta () {
		return {
			...super.getFolderPathMeta(),
			published: {
				label: "Publication Date (Full)",
				getter: it => {
					if (!it.published) return "\u2014";
					const date = new Date(it.published);
					return DatetimeUtil.getDateStr({date});
				},
			},
			publishedFull: {
				label: "Publication Date (Short)",
				getter: it => {
					if (!it.published) return "\u2014";
					return it.published;
				},
			},
			publishedYear: {
				label: "Publication Year",
				getter: it => {
					if (!it.published) return "\u2014";
					return new Date(it.published).getFullYear();
				},
			},
		};
	}

	getData () {
		try {
			return this._getData();
		} catch (e) {
			ui.notifications.error(`Failed to pre-process data! ${VeCt.STR_SEE_CONSOLE}`);
			throw e;
		}
	}

	_getData () {
		this._content = MiscUtil.copy(this._content);

		this._availableEntities = {};
		this._availableInlineData = {};

		const tagWalker = MiscUtil.getWalker({
			keyBlocklist: ImportListAdventureBook._TAG_WALKER_BLOCKLIST,
		});

		// Track any hashes we've effectively found in inline data already, and avoid re-importing them
		const fromInline = {};

		const source = this._content._contentMetadata.source || this._content._contentMetadata.id;

		// region Synthetic entities from inline data
		Object.values(ImportListAdventureBook._IMPORTABLE_TAGS)
			.filter(it => it.fnGetInlineData && it.fnGetInlineHash)
			.forEach(importable => {
				const pack = {
					[this._dataProp]: this._content._contentMetadata,
					[this._brewDataProp]: {data: this._content.data},
				};
				const nxtOpts = {
					headProp: this._dataProp,
					bodyProp: this._brewDataProp,
				};

				const hashes = new Set();
				this._availableInlineData[importable.tag] = importable.fnGetInlineData(pack, nxtOpts)
					.sort((a, b) => {
						return SortUtil.ascSortLower(a.name, b.name)
							|| SortUtil.ascSortLower(Parser.sourceJsonToFull(a.source || source), Parser.sourceJsonToFull(b.source || source));
					})
					.filter(it => {
						const hash = importable.fnGetInlineHash(it);
						// This is iffy--e.g. multiple tables from the same adventure may have the same name.
						//   Leave it disabled until we find a compelling case for/against (then make it a config option?).
						// if (hashes.has(hash)) return false;
						hashes.add(hash);
						return true;
					});

				fromInline[importable.tag] = hashes;
			});
		// endregion

		// region References to entities
		this._content.data.forEach((chapter, ixChapter) => {
			const handlers = {
				string: (str) => {
					const tagSplit = Renderer.splitByTags(str);
					const len = tagSplit.length;
					for (let i = 0; i < len; ++i) {
						const s = tagSplit[i];
						if (!s) continue;
						if (!s.startsWith("{@")) continue;

						const [tag, text] = Renderer.splitFirstSpace(s.slice(1, -1));
						const importableTag = ImportListAdventureBook._IMPORTABLE_TAGS[tag];
						if (!importableTag) continue;

						const extractedTag = importableTag._extractTag(text);
						if (!extractedTag) continue;

						if (fromInline[tag] && fromInline[tag].has(extractedTag.hash)) continue;

						(this._availableEntities[tag] = this._availableEntities[tag] || {})[extractedTag.source] =
							this._availableEntities[tag][extractedTag.source] || new Set();
						this._availableEntities[tag][extractedTag.source].add(extractedTag.hash);
					}
					return str;
				},
				object: (obj, lastKey, stack) => {
					UtilAdventureBook.doProcessNode_mutAddMaps({
						availableMaps: this._availableMaps,
						entryIdToMap: this._entryIdToMap,
						entryIdToName: this._entryIdToName,
						entry: obj,
						entryStack: stack,
						source,
						chapterInfo: this._content._contentMetadata.contents?.[ixChapter],
					});
					return obj;
				},
			};

			tagWalker.walk(chapter, handlers, undefined, []);
		});
		// endregion

		// Post-processing step to add names to maps
		UtilAdventureBook.mutMapNames({availableMaps: this._availableMaps, entryIdToMap: this._entryIdToMap, entryIdToName: this._entryIdToName});

		Object.values(ImportListAdventureBook._IMPORTABLE_TAGS)
			.forEach(importable => {
				const additionalContent = this._getAdditionalContentForTag(importable.tag);
				if (!additionalContent?.length) return;

				additionalContent.forEach(({source, hash}) => {
					source = source.toLowerCase();
					const tgt = MiscUtil.getOrSet(this._availableEntities, importable.tag, source, new Set());
					tgt.add(hash);
				});
			});

		const tagSections = Object.entries(ImportListAdventureBook._IMPORTABLE_TAGS)
			.map(([tag, importableMeta]) => {
				const sourceMetas = this._availableEntities[tag];
				const inlineData = this._availableInlineData[tag];

				const out = {
					displayName: importableMeta.displayName,
					tag,
					sources: [],
				};

				if (sourceMetas) {
					out.sources.push(
						...Object.entries(sourceMetas)
							.map(([src, set]) => {
								return {
									sourceLong: Parser.sourceJsonToFull(src),
									sourceShort: Parser.sourceJsonToAbv(src),
									sourceClassName: Parser.sourceJsonToColor(src),
									sourceStyle: BrewUtil2.sourceJsonToStylePart(src),
									source: src,
									count: set.size,
								};
							}),
					);
				}

				if (inlineData && inlineData.length) {
					const existingSource = out.sources.find(it => it.source.toLowerCase() === source.toLowerCase());

					if (existingSource) existingSource.count += inlineData.length;
					else {
						out.sources.push({
							sourceLong: Parser.sourceJsonToFull(source),
							sourceShort: Parser.sourceJsonToAbv(source),
							sourceClassName: Parser.sourceJsonToColor(source),
							sourceStyle: BrewUtil2.sourceJsonToStylePart(source),
							source,
							count: inlineData.length,
						});
					}
				}

				out.sources.sort((a, b) => SortUtil.ascSortLower(a.sourceLong, b.sourceLong));

				return out;
			})
			.filter(it => it.sources.length);

		const imageGroupSections = Object.values(ImportListAdventureBook._IMPORTABLE_IMAGE_TYPES)
			.map(it => it.group)
			.unique()
			.map(group => {
				const importableImageTypes = Object.values(ImportListAdventureBook._IMPORTABLE_IMAGE_TYPES)
					.filter(it => it.group === group);
				if (!importableImageTypes.length) return null;

				const imageTypeMetas = importableImageTypes
					.map(({imageType, displayName}) => {
						const count = Object.values(this._availableMaps[imageType] || {}).length;
						if (!count) return null;

						return {
							imageType,
							displayName,
							count,
						};
					})
					.filter(Boolean);
				if (!imageTypeMetas.length) return null;

				return {
					group,
					groupNamePlural: importableImageTypes[0].groupNamePlural,
					imageTypeMetas,
				};
			})
			.filter(Boolean);

		return {
			name: this._content._contentMetadata.name,
			titleSearch: this._titleSearch,
			tagSections,
			imageGroupSections,
		};
	}

	async _renderInner_custom ($html) {
		this._renderInner_initCheckboxes($html);
		this._renderInner_initConfigButtons($html);
		this._renderInner_initRunButton($html);
	}

	_renderInner_initCheckboxes ($html) {
		this._tagCbMetas = {};
		this._imageGroupCbMetas = {};

		// region Tags
		// Per-tag per-source checkboxes
		$html.find(`input[data-tag][data-source]`).each((i, e) => {
			const $cb = $(e);

			const tag = $cb.data("tag");
			const source = $cb.data("source");

			(this._tagCbMetas[tag] = this._tagCbMetas[tag] || []).push({
				source,
				$cb,
			});
		});

		// Per-tag "select all" checkboxes
		const $cbsAllTag = $html.find(`input[data-tag][data-type="all"]`).map((i, e) => {
			const $cb = $(e);
			const tag = $cb.data("tag");
			$cb.change(() => {
				const toVal = $cb.prop("checked");
				this._tagCbMetas[tag].forEach(meta => meta.$cb.prop("checked", toVal));
			});
			return $cb;
		}).get();
		// endregion

		// region Image groups
		// Per-tag image group checkboxes
		$html.find(`input[data-image-group][data-image-type]`).each((i, e) => {
			const $cb = $(e);

			const imageGroup = $cb.data("image-group");
			const imageType = $cb.data("image-type");

			(this._imageGroupCbMetas[imageGroup] = this._imageGroupCbMetas[imageGroup] || []).push({
				imageType,
				$cb,
			});
		});

		const $cbsAllImageGroup = $html.find(`input[data-image-group][data-type="all"]`).map((i, e) => {
			const $cb = $(e);
			const imageGroup = $cb.data("image-group");
			$cb.change(() => {
				const toVal = $cb.prop("checked");
				this._imageGroupCbMetas[imageGroup].forEach(meta => meta.$cb.prop("checked", toVal));
			});
			return $cb;
		}).get();
		// endregion

		// "God" checkbox
		const $cbGod = $html.find(`input[data-type="god"]`);
		$cbGod.change(() => {
			const toVal = $cbGod.prop("checked");
			$cbsAllTag.forEach($cb => $cb.prop("checked", toVal).change());
			$cbsAllImageGroup.forEach($cb => $cb.prop("checked", toVal).change());
		});
	}

	_renderInner_initConfigButtons ($html) {
		const doBindConfigButtons = ({dataType, dataProp, lookup, pFnGetImporter}) => {
			$html.find(`button[data-type="${dataType}"]`).each((i, e) => {
				const $btn = $(e);
				const key = $btn.data(dataProp);

				$btn.click(async () => {
					const importer = pFnGetImporter ? await pFnGetImporter() : lookup[key].importer;
					await importer.pInit();
					await importer.pHandleEditFolderPathClick();
				});
			});
		};

		// Per-tag "open config" buttons
		doBindConfigButtons({
			dataType: "configure-tag",
			dataProp: "tag",
			lookup: ImportListAdventureBook._IMPORTABLE_TAGS,
		});

		doBindConfigButtons({
			dataType: "configure-image",
			pFnGetImporter: () => this.constructor._getImportListMap(),
		});
	}

	_renderInner_initRunButton ($html) {
		$html.find(`[name="btn-run"]`).click(async () => this._pHandleRunButtonClick());
	}

	async _pHandleRunButtonClick () {
		this.close();

		console.log(...LGT, `Importing ${this._dataProp} "${this._content._contentMetadata.name}"`);

		const runInfo = new ImportListAdventureBook._RunInfo();

		const preloadedTagMetas = await this._pHandleRunButtonClick_pDoPreImport({runInfo});
		if (runInfo.isCancelled) return;
		const entryIdToJournalId = await this._pHandleRunButtonClick_pDoMainImport({preloadedTagMetas, runInfo});
		if (runInfo.isCancelled) return;
		await this._pHandleRunButtonClick_pDoPostImport({entryIdToJournalId, runInfo});
	}

	async _pHandleRunButtonClick_pDoPreImport ({runInfo}) {
		const loadedEntityInfos = {};

		const taskListTags = await this._pHandleRunButtonClick_pGetTaskListTags({loadedEntityInfos});

		if (!taskListTags.length) return loadedEntityInfos;

		const runner = await UtilApplications.pRunTasks(
			taskListTags,
			{
				titleInitial: "Importing...",
				titleComplete: "Import Complete",
				fnGetRowRunningText: (taskName) => `Importing ${taskName}...`,
				fnGetRowSuccessText: (taskName) => `Imported ${taskName}.`,
				fnGetRowErrorText: (taskName) => `Failed to import ${taskName}! ${VeCt.STR_SEE_CONSOLE}`,
				// Force close this progress box, as we'll open another one for the main content later
				isForceClose: true,
			},
		);
		if (runner.isCancelled) return runInfo.isCancelled = runner.isCancelled;

		return loadedEntityInfos;
	}

	async _pHandleRunButtonClick_pGetTaskListTags ({loadedEntityInfos}) {
		const toImportTagSources = {};

		Object.entries(this._tagCbMetas).forEach(([tag, metas]) => {
			const activeSources = metas.filter(meta => meta.$cb.prop("checked")).map(meta => meta.source);
			if (!activeSources.length) return;

			toImportTagSources[tag] = activeSources;
		});

		const taskList = [];

		for (const [tag, sources] of Object.entries(toImportTagSources)) {
			const loaded = (loadedEntityInfos[tag] = {});
			const importableTag = ImportListAdventureBook._IMPORTABLE_TAGS[tag];

			for (const source of sources) {
				// Import from hashes
				const hashes = new Set([...(MiscUtil.get(this._availableEntities, tag, source) || [])]);
				for (const hash of hashes) {
					const [rawName, rawSource] = hash.split(HASH_LIST_SEP);
					const prettyName = decodeURIComponent(rawName).toTitleCase();
					const prettySource = Parser.sourceJsonToAbv(rawSource);

					taskList.push(new Util.Task(
						`${importableTag.displayName}: ${prettyName} (${prettySource})`,
						() => (async () => {
							const {folderType, id: importedId} = await importableTag.pLoadHash(hash);
							(loaded[tag] = loaded[tag] || {})[hash] = {folderType, importedId};
						})(),
					));
				}
			}

			// Import from inline data
			const inlines = [...(MiscUtil.get(this._availableInlineData, tag) || [])];
			for (const inline of inlines) {
				taskList.push(new Util.Task(
					`${importableTag.displayName}: ${inline.name} (${inline.source})`,
					() => (async () => {
						// Don't save the folder ID/imported IDs from these, as they will appear inline in the
						//   imported data regardless.
						await importableTag._pLoadInline(inline);
					})(),
				));
			}
		}

		return taskList;
	}

	async _pHandleRunButtonClick_pGetTaskListImageGroups ({entryIdToJournalId}) {
		const toImportImageTypes = {};

		Object.entries(this._imageGroupCbMetas).forEach(([imageGroup, metas]) => {
			const activeImageTypes = metas.filter(meta => meta.$cb.prop("checked")).map(meta => meta.imageType);
			if (!activeImageTypes.length) return;

			toImportImageTypes[imageGroup] = activeImageTypes;
		});

		let importListMap;
		const taskList = [];

		for (const imageTypes of Object.values(toImportImageTypes)) {
			for (const imageType of imageTypes) {
				const importableImageType = ImportListAdventureBook._IMPORTABLE_IMAGE_TYPES[imageType];

				const urlToEntry = this._availableMaps[imageType];
				for (const entry of Object.values(urlToEntry)) {
					if (!importListMap) importListMap = await this.constructor._getImportListMap();

					const task = new Util.Task(
						`${importableImageType.groupName || importableImageType.group}: ${entry.name}`,
						() => {
							return importListMap.pImportEntry(
								entry,
								{
									entryIdToJournalId,
								},
							);
						},
					);
					taskList.push(task);
				}
			}
		}

		return taskList;
	}

	static async _getImportListMap () {
		const {ImportListMap} = await import("./ImportListMap.js");
		const importListMap = new ImportListMap();
		await importListMap.pInit();
		return importListMap;
	}

	async _pHandleRunButtonClick_pDoMainImport ({preloadedTagMetas, runInfo}) {
		const tagWalker2 = MiscUtil.getWalker({
			keyBlocklist: ImportListAdventureBook._TAG_WALKER_BLOCKLIST,
		});

		const handlers = {
			string: (str) => {
				const tagSplit = Renderer.splitByTags(str);
				const len = tagSplit.length;

				let stack = "";
				for (let i = 0; i < len; ++i) {
					const s = tagSplit[i];
					if (!s) continue;

					if (!s.startsWith("{@")) {
						stack += s;
						continue;
					}

					const [tag, text] = Renderer.splitFirstSpace(s.slice(1, -1));
					const importableTag = ImportListAdventureBook._IMPORTABLE_TAGS[tag];
					const preloadedMeta = preloadedTagMetas[tag];

					if (!importableTag || !preloadedMeta) {
						stack += s;
						continue;
					}

					const extractedTag = importableTag._extractTag(text);
					if (!extractedTag) {
						stack += s;
						continue;
					}

					const preloaded = MiscUtil.get(preloadedMeta, tag, extractedTag.hash);

					if (!preloaded) {
						stack += s;
						continue;
					}

					// e.g. `@Actor[myId]{myDisplayText}`
					//   Encode the initial "@" as this temp string to ensure the renderer doesn't get the wrong idea
					stack += `${DataConverter.SYM_AT}${preloaded.folderType}[${preloaded.importedId}]{${extractedTag.displayText}}`;
				}

				return stack;
			},
		};

		this._content.data = tagWalker2.walk(this._content.data, handlers);

		let wrappedJournalDatas;
		try {
			wrappedJournalDatas = await this._pGetJournalDatas();
		} catch (e) {
			ui.notifications.error(`Failed to build journal data! ${VeCt.STR_SEE_CONSOLE}`);
			throw e;
		}

		const folderIdRoot = await this._pImportEntry_pGetFolderId({
			name: this._content._contentMetadata.name,
			source: this._content._contentMetadata.source,
			published: this._content._contentMetadata.published,
		}, {sorting: "m"});

		const finalizeLinkLookup = {};
		const entryIdToJournalId = {};

		const taskList = [];
		for (const wrappedJournalData of wrappedJournalDatas) {
			const task = new Util.Task(
				wrappedJournalData.journalEntry.name,
				() => this._pImportWrappedJournalData({finalizeLinkLookup, entryIdToJournalId, folderIdRoot, wrappedJournalData}),
			);
			taskList.push(task);
		}

		const finalizeTask = new Util.Task(
			`Finalizing`,
			async () => {
				if (Object.keys(finalizeLinkLookup).length) {
					const reLink = new RegExp(`%${SharedConsts.MODULE_NAME_FAKE}_(\\d+)__(\\d+)_${SharedConsts.MODULE_NAME_FAKE}%`, "gi");
					const linkType = Config.get("journalEntries", "isEnableJournalEmbeds") && Config.get(this._configGroup, "isUseJournalEmbeds") ? `EmbedJournalEntry` : `JournalEntry`;

					for (const metaChapters of Object.values(finalizeLinkLookup)) {
						for (const journalEntry of Object.values(metaChapters)) {
							const contentNxt = journalEntry.data.content.replace(reLink, (...m) => {
								const [, ixChapterRaw, ixFlatRaw] = m;

								const linkedJournalEntry = finalizeLinkLookup[ixChapterRaw]?.[ixFlatRaw];

								return `@${linkType}[${linkedJournalEntry?.id}]`;
							});

							if (contentNxt !== journalEntry.data.content) await UtilDocuments.pUpdateDocument(journalEntry, {content: contentNxt});
						}
					}
				}
			},
		);
		taskList.push(finalizeTask);

		ui.sidebar.activateTab("journal");

		const runner = await UtilApplications.pRunTasks(
			taskList,
			{
				titleInitial: "Importing...",
				titleComplete: "Import Complete",
				fnGetRowRunningText: (taskName) => taskName === `Finalizing` ? `${taskName}...` : `Importing ${taskName}...`,
				fnGetRowSuccessText: (taskName) => taskName === `Finalizing` ? `Finalized.` : `Imported ${taskName}.`,
				fnGetRowErrorText: (taskName) => taskName === `Finalizing` ? `Failed to finalize!` : `Failed to import ${taskName}! ${VeCt.STR_SEE_CONSOLE}`,
			},
		);
		if (runner.isCancelled) return runInfo.isCancelled = runner.isCancelled;

		if (runner.isCancelled) {
			runInfo.isCancelled = runner.isCancelled;
			return entryIdToJournalId;
		}

		return entryIdToJournalId;
	}

	async _pImportWrappedJournalData ({finalizeLinkLookup, entryIdToJournalId, folderIdRoot, wrappedJournalData}) {
		const {journalEntry, folderNames} = wrappedJournalData;

		const duplicateMetaOpts = {name: journalEntry.name};
		if (
			Config.get(this._configGroup, "journalEntrySplitMode") === ConfigConsts.C_IMPORT_ADVBOOK_JOURNAL_SPLIT_STRATEGY_CHAPTER
			|| Config.get(this._configGroup, "isOrderingPrefixJournalNames")
		) {
			// For the basic case, or when we're using fully-qualified named, just match by name + source
			duplicateMetaOpts.flags = {[SharedConsts.MODULE_NAME_FAKE]: {source: journalEntry.flags[SharedConsts.MODULE_NAME_FAKE].source}};
		} else {
			// Otherwise, match by flags
			duplicateMetaOpts.flags = {
				[SharedConsts.MODULE_NAME_FAKE]: {
					source: journalEntry.flags[SharedConsts.MODULE_NAME_FAKE].source,
					ixChapter: journalEntry.flags[SharedConsts.MODULE_NAME_FAKE].ixChapter,
					ixFlat: journalEntry.flags[SharedConsts.MODULE_NAME_FAKE].ixFlat,
				},
			};
		}

		const duplicateMeta = Object.keys(duplicateMetaOpts).length ? this._getDuplicateMeta(duplicateMetaOpts) : null;
		if (duplicateMeta?.isSkip) {
			const entryIds = duplicateMeta.existing?.data?.flags?.[SharedConsts.MODULE_NAME_FAKE]?.entryIds || [];
			entryIds.forEach(id => entryIdToJournalId[id] = duplicateMeta.existing.id);

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_SKIPPED_DUPLICATE,
				imported: [
					new ImportedDocument({
						document: duplicateMeta.existing,
						isExisting: true,
					}),
				],
			});
		}

		if (duplicateMeta?.isOverwrite) {
			const entryIds = duplicateMeta.existing?.data?.flags?.[SharedConsts.MODULE_NAME_FAKE]?.entryIds || [];
			entryIds.forEach(id => entryIdToJournalId[id] = duplicateMeta.existing.id);

			return this._pImportEntry_pDoUpdateExistingDirectoryEntity(duplicateMeta, journalEntry);
		}

		let folderId = folderIdRoot;
		if (folderNames?.length) {
			folderId = await UtilFolders.pCreateFoldersGetId({
				folderType: this.constructor.FOLDER_TYPE,
				folderIdRoot,
				folderNames,
				sorting: "m",
			});
		}
		if (folderId) journalEntry.folder = folderId;

		const createdEntry = await JournalEntry.create(journalEntry, {renderSheet: false, temporary: false});

		const flags = createdEntry?.data?.flags?.[SharedConsts.MODULE_NAME_FAKE];
		if (flags) (finalizeLinkLookup[flags.ixChapter] = finalizeLinkLookup[flags.ixChapter] || {})[flags.ixFlat] = createdEntry;

		const entryIds = createdEntry?.data?.flags?.[SharedConsts.MODULE_NAME_FAKE]?.entryIds || [];
		entryIds.forEach(id => entryIdToJournalId[id] = createdEntry.id);
	}

	async _pHandleRunButtonClick_pDoPostImport ({entryIdToJournalId, runInfo}) {
		const taskListImageGroups = await this._pHandleRunButtonClick_pGetTaskListImageGroups({entryIdToJournalId});

		if (!taskListImageGroups.length) return;

		const runner = await UtilApplications.pRunTasks(
			taskListImageGroups,
			{
				titleInitial: "Importing...",
				titleComplete: "Import Complete",
				fnGetRowRunningText: (taskName) => `Importing ${taskName}...`,
				fnGetRowSuccessText: (taskName) => `Imported ${taskName}.`,
				fnGetRowErrorText: (taskName) => `Failed to import ${taskName}! ${VeCt.STR_SEE_CONSOLE}`,
				// Force close this progress box, as we leave the main one open
				isForceClose: true,
			},
		);
		if (runner.isCancelled) return runInfo.isCancelled = runner.isCancelled;
	}

	/**
	 * @return {Promise}
	 */
	async _pGetJournalDatas () {
		throw new Error(`Unimplemented!`);
	}

	/** Optionally return a list of `{source: "<source>>", hash: "<hash>"}` */
	_getAdditionalContentForTag () { return null; }

	static _registerImportableTag (importableTagInstance) {
		this._IMPORTABLE_TAGS[importableTagInstance.tag] = importableTagInstance;
	}

	static _registerImportableImageType (importableImageTypeInstance) {
		this._IMPORTABLE_IMAGE_TYPES[importableImageTypeInstance.imageType] = importableImageTypeInstance;
	}
}
ImportListAdventureBook._IMPORTABLE_TAGS = {};
ImportListAdventureBook._IMPORTABLE_IMAGE_TYPES = {};
ImportListAdventureBook._HOMEBREW_OTHER_DATA = {};

ImportListAdventureBook._RunInfo = class {
	constructor () {
		this.isCancelled = false;
	}
};

ImportListAdventureBook.ImportableTag = class {
	constructor (opts) {
		this._displayName = opts.displayName;
		this._tag = opts.tag;
		this._props = opts.props;
		this._page = opts.page;
		this._defaultSource = opts.defaultSource;
		this._importer = opts.importer;
		this._fnGetInlineData = opts.fnGetInlineData;
		this._fnGetInlineHash = opts.fnGetInlineHash;

		// local fields
		this._isActivatedTab = false;
	}

	get displayName () { return this._displayName; }
	get tag () { return this._tag; }
	get page () { return this._page; }
	get importer () { return this._importer; }
	get fnGetInlineData () { return this._fnGetInlineData; }
	get fnGetInlineHash () { return this._fnGetInlineHash; }

	pLoadHash (hash) {
		this._pLoad_doActivateTab();
		return this._pLoadGenericHash(hash);
	}

	_pLoad_doActivateTab () {
		// Avoid repeatedly activating the same sidebar tab, as it requires a jQuery selector lookup each time
		if (!this._isActivatedTab) {
			this._importer.activateSidebarTab();
			this._isActivatedTab = true;
		}
	}

	async _pLoadGenericHash (hash) {
		const [, source] = hash.split(HASH_LIST_SEP);

		// Error out if the entity is not found; this is done in its own task, so will not crash the entire import
		const entity = await Renderer.hover.pCacheAndGet(this._page, source, hash, {isRequired: true});

		await this._importer.pInit();
		const importSummary = await this._importer.pImportEntry(entity, {});

		return {
			folderType: this._importer.constructor.FOLDER_TYPE,
			id: importSummary.imported?.[0]?.document?.id,
			hash,
		};
	}

	static _getExtractedGenericTag (page, defaultSource, tag) {
		const [name, rawSource, rawDisplayText] = Renderer.splitTagByPipe(tag);
		const source = (rawSource || defaultSource).toLowerCase();
		const hashEnt = {name, source};
		return {
			source,
			displayText: rawDisplayText || name,
			hash: UrlUtil.URL_TO_HASH_BUILDER[page](hashEnt),
		};
	}

	_extractTag (tag) {
		const out = ImportListAdventureBook.ImportableTag._getExtractedGenericTag(this._page, this._defaultSource, tag);
		// Note: this is a brute-force bodge. As an @tag can map to multiple data properties (e.g. "@item" maps to "item",
		//   "baseitem", etc.), and we don't want to load every single linked entity here (for performance reasons), we
		//   have no other choice but to loop through the potential props for each tagged UID. This isn't _too_ bad, as
		//   hashes should be unique within the context of each @tag, so we should not expect any false positives.
		const isExcluded = this._props.some(prop => ExcludeUtil.isExcluded(out.hash, prop, out.source, {isNoCount: true}));
		if (isExcluded) return null;
		return out;
	}

	async _pLoadInline (inline) {
		this._pLoad_doActivateTab();
		await this._importer.pInit();
		await this._importer.pImportEntry(inline, {});
	}
};

ImportListAdventureBook.ImportableImageType = class {
	constructor ({group, groupName, groupNamePlural, displayName, imageType}) {
		this._group = group;
		this._groupName = groupName;
		this._groupNamePlural = groupNamePlural;
		this._displayName = displayName;
		this._imageType = imageType;
	}

	get group () { return this._group; }
	get groupName () { return this._groupName; }
	get groupNamePlural () { return this._groupNamePlural; }
	get displayName () { return this._displayName; }
	get imageType () { return this._imageType; }
};

ImportListAdventureBook._TAG_WALKER_BLOCKLIST = new Set([
	"name",
	"caption",
	"colLabels",
	"style",
	"type",
	"href",
	"page",
]);

ImportListAdventureBook.IMPORTABLE_TAG_CREATURE = {
	displayName: "Creatures",
	tag: "@creature",
	props: ["monster"],
	page: UrlUtil.PG_BESTIARY,
	defaultSource: SRC_MM,
	importer: new ImportListCreature(),
};
ImportListAdventureBook._registerImportableTag(new ImportListAdventureBook.ImportableTag(ImportListAdventureBook.IMPORTABLE_TAG_CREATURE));

ImportListAdventureBook._registerImportableTag(new ImportListAdventureBook.ImportableTag({
	displayName: "Spells",
	tag: "@spell",
	props: ["spell"],
	page: UrlUtil.PG_SPELLS,
	defaultSource: SRC_PHB,
	importer: new ImportListSpell(),
}));

ImportListAdventureBook._registerImportableTag(new ImportListAdventureBook.ImportableTag({
	displayName: "Items",
	tag: "@item",
	props: ["item", "baseitem", "magicvariant", "itemGroup"],
	page: UrlUtil.PG_ITEMS,
	defaultSource: SRC_DMG,
	importer: new ImportListItem(),
}));

ImportListAdventureBook._registerImportableTag(new ImportListAdventureBook.ImportableTag({
	displayName: "Variant Rules",
	tag: "@variantrule",
	props: ["variantrule"],
	page: UrlUtil.PG_VARIANTRULES,
	defaultSource: SRC_DMG,
	importer: new ImportListVariantRule(),
}));

ImportListAdventureBook._registerImportableTag(new ImportListAdventureBook.ImportableTag({
	displayName: "Vehicle Upgrades",
	tag: "@vehupgrade",
	props: ["vehicleUpgrade"],
	page: UrlUtil.PG_VEHICLES,
	defaultSource: SRC_GoS,
	importer: new ImportListVehicleUpgrade(),
}));

ImportListAdventureBook._registerImportableTag(new ImportListAdventureBook.ImportableTag({
	displayName: "Tables",
	tag: "@table",
	props: ["table", "tableGroup"],
	page: UrlUtil.PG_TABLES,
	defaultSource: SRC_DMG,
	importer: new ImportListRollableTable(),
	fnGetInlineData: (pack, opts) => {
		const {table: inlineTables, tableGroup: inlineTableGroups} = UtilGenTables.getAdventureBookTables(pack, opts);
		inlineTables.forEach(it => it.__prop = "table");
		inlineTableGroups.forEach(it => it.__prop = "tableGroup");
		return [...inlineTables, ...inlineTableGroups];
	},
	fnGetInlineHash: it => {
		return UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_TABLES](it).toLowerCase();
	},
}));

ImportListAdventureBook._registerImportableImageType(new ImportListAdventureBook.ImportableImageType({
	group: "maps",
	groupName: "Map",
	groupNamePlural: "Maps",
	displayName: "Map",
	imageType: "map",
}));

ImportListAdventureBook._registerImportableImageType(new ImportListAdventureBook.ImportableImageType({
	group: "maps",
	groupName: "Map",
	groupNamePlural: "Maps",
	displayName: "Player Map",
	imageType: "mapPlayer",
}));

export {ImportListAdventureBook};
