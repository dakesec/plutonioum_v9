import {UtilLibWrapper} from "./PatcherLibWrapper.js";
import {Config} from "./Config.js";
import {ChooseImporter} from "./ChooseImporter.js";
import {LGT} from "./Util.js";
import {UtilApplications} from "./UtilApplications.js";
import {UtilEvents} from "./UtilEvents.js";
import {PopoutSheet} from "./PopoutSheet.js";

class Patcher_TextEditor {
	static init () {
		UtilLibWrapper.addPatch(
			"TextEditor.enrichHTML",
			this._lw_TextEditor_enrichHTML,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
		);

		UtilLibWrapper.addPatch(
			"JournalSheet.prototype._disableFields",
			this._lw_JournalSheet_prototype__disableFields,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
		);

		UtilEvents.registerDocumentHandler({
			eventType: "click",
			selector: `.jemb__btn-toggle`,
			fnEvent: Patcher_TextEditor.JournalEmbed.handleToggleClick.bind(Patcher_TextEditor.JournalEmbed),
		});

		UtilEvents.registerDocumentHandler({
			eventType: "click",
			selector: `.jlnk__entity-link`,
			fnEvent: Patcher_TextEditor.ContentLoader.handleClick.bind(Patcher_TextEditor.JournalEmbed),
		});

		Patcher_TextEditor.ContentDragDrop.init();
	}

	static _lw_TextEditor_enrichHTML (fn, ...args) {
		if (!Config.get("journalEntries", "isEnableJournalEmbeds") && !Config.get("text", "isEnableContentLinks")) return fn(...args);
		return Patcher_TextEditor.enrichHTML(fn, ...args);
	}

	static _lw_JournalSheet_prototype__disableFields (fn, ...args) {
		const res = fn(...args);
		if (!Config.get("journalEntries", "isEnableJournalEmbeds")) return res;
		Patcher_TextEditor.JournalEmbed._doEnableToggleButtons(...args);
		return res;
	}

	/** Based on the original method. */
	static enrichHTML (originalEnrichHtml, content, opts, depth = 0) {
		opts = opts || {};

		if (opts.secrets === undefined) opts.secrets = false;
		if (opts.documents === undefined) opts.documents = true;
		if (opts.links === undefined) opts.links = true;
		if (opts.rolls === undefined) opts.rolls = true;

		// Call the original method--"content" is now enriched HTML
		content = originalEnrichHtml(content, opts);

		// If we are not to replace dynamic entity links, return the base content
		if (!opts.documents) return content;

		// Don't load compendiums--we don't match `EmbedCompendium`
		content = content
			.replace(/@Embed(JournalEntry)\[([^\]]+)](?:{([^}]+)})?/g, (...m) => Patcher_TextEditor.JournalEmbed.getHtml(opts, depth, ...m))
			.replace(/@(Actor)Embedded(Item)\[([^\]]+)]\[([^\]]+)](?:{([^}]+)})?/g, (...m) => Patcher_TextEditor.EmbeddedDocument.getHtml(opts, depth, ...m))
			.replace(/@Folder\[([^\]]+)](?:{([^}]+)})?/g, (...m) => Patcher_TextEditor.Folder.getHtml(opts, depth, ...m))
			.replace(/@([a-zA-Z]+)\[([^\]]+)](?:{([^}]+)})?/g, (...m) => Patcher_TextEditor.ContentLoader.getHtml(opts, depth, ...m))
		;

		return content;
	}
}

Patcher_TextEditor.Enricher = class {
	static _getEntityPermissions (entity) {
		if (game.user.isGM) return CONST.ENTITY_PERMISSIONS.OWNER;
		return entity.permission;
	}

	static _getEntity (collection, entityNameOrId) {
		// Match either on ID or by name
		let entity = null;
		if (/^[a-zA-Z0-9]{16}$/.test(entityNameOrId)) entity = collection.get(entityNameOrId);
		if (!entity) entity = (collection.contents || collection.entries).find(e => e.data.name === entityNameOrId);
		return entity;
	}
};

Patcher_TextEditor.JournalEmbed = class extends Patcher_TextEditor.Enricher {
	static getHtml (enrichOpts, depth, fullText, entityType, entityNameOrId, displayText) {
		const config = CONFIG[entityType];
		const collection = config.collection.instance;
		const entity = this._getEntity(collection, entityNameOrId);

		if (!entity) return `<a class="entity-link broken"><i class="fas fa-unlink"></i> ${displayText || entityNameOrId}</a>`;

		// Get the standard Foundry link
		const htmlJournalLink = TextEditor._createContentLink(fullText, entityType, entityNameOrId, displayText).outerHTML;
		if (this._getEntityPermissions(entity) < CONST.ENTITY_PERMISSIONS.OBSERVER) return htmlJournalLink;

		const isAutoExpand = Config.get("journalEntries", "isAutoExpandJournalEmbeds");
		if (entity.sheet._sheetMode === "image") {
			const img = entity.data.img;
			return `<div class="w-100 ve-flex-col">
				<div class="ve-flex-v-center mb-1 jemb__wrp-lnk">${htmlJournalLink}${this._getBtnHtmlToggle(isAutoExpand)}</div>
				<div class="ve-flex-vh-center jemb__wrp-content ${isAutoExpand ? "" : "ve-hidden"}"><a target="_blank w-100" href="${img}"><img src="${img}" class="jemb__img"></a></div>
			</div>`;
		} else {
			// Avoid infinite loops
			const isTooDeep = depth === Patcher_TextEditor.JournalEmbed._MAX_RECURSION_DEPTH;
			const subContent = isTooDeep ? entity.data.content : TextEditor.enrichHTML(entity.data.content, enrichOpts, depth + 1);
			return `<div class="w-100 ve-flex-col">
				<div class="ve-flex-v-center mb-1 jemb__wrp-lnk">${htmlJournalLink}${this._getBtnHtmlToggle(isAutoExpand)}</div>
				${isTooDeep ? `<div class="mb-1 bold veapp__msg-error">Warning: too many recursive embeds! Have you made an infinite loop?</div>` : ""}
				<div class="w-100 jemb__wrp-content ${isAutoExpand ? "" : "ve-hidden"}">${subContent}</div>
			</div>`;
		}
	}

	static handleToggleClick (event) {
		const $btn = $(event.currentTarget);
		const isExpanded = $btn.attr("data-plut-is-expanded") === "1";

		if (event.shiftKey) {
			event.preventDefault();

			const $editor = $btn.closest(`.editor`);
			$editor.find(`button[data-plut-is-expanded]`).each((i, e) => this._handleExpandCollapse($(e), isExpanded));
			return;
		}

		this._handleExpandCollapse($btn, isExpanded);
	}

	static _handleExpandCollapse ($btn, isExpanded) {
		const $wrp = $btn.parent().next();
		$wrp.toggleClass("ve-hidden", isExpanded);
		$btn
			.attr("data-plut-is-expanded", isExpanded ? "0" : "1")
			.html(isExpanded ? `<i class="fa fa-caret-square-left"></i>` : `<i class="fa fa-caret-square-down"></i>`)
			.title(`${isExpanded ? `Expand` : `Collapse`} Journal Entry (SHIFT for All Entries)`);
	}

	static _getBtnHtmlToggle (isAutoExpand) {
		return `<button class="btn btn-xxs btn-5et btn-default ve-flex-vh-center mx-1 jemb__btn-toggle" data-plut-is-expanded="${isAutoExpand ? 1 : 0}" title="${isAutoExpand ? "Collapse" : "Expand"} Journal Entry (SHIFT for All Entries)" type="button">${isAutoExpand ? `<i class="fa fa-caret-square-down"></i>` : `<i class="fa fa-caret-square-left"></i>`}</button>`;
	}

	/** Based on `FormApplication._disableFields` */
	static _doEnableToggleButtons (form) {
		for (let el of form.getElementsByTagName("BUTTON")) {
			if (el.classList.contains("jemb__btn-toggle")) el.removeAttribute("disabled");
		}
	}
};
Patcher_TextEditor.JournalEmbed._MAX_RECURSION_DEPTH = 69; // Arbitrary number of steps

Patcher_TextEditor.EmbeddedDocument = class extends Patcher_TextEditor.Enricher {
	static getHtml (enrichOpts, depth, fullText, parentEntityType, childEntityType, parentEntityNameOrId, childEntityNameOrId, displayText) {
		const config = CONFIG[parentEntityType];
		const collection = config.collection.instance;
		const parentEntity = this._getEntity(collection, parentEntityNameOrId);

		if (!parentEntity) return `<a class="entity-link broken"><i class="fas fa-unlink"></i> ${displayText || `${parentEntityNameOrId}.${childEntityNameOrId}`}</a>`;

		const configChild = CONFIG[childEntityType];
		const childEntity = this._getEntity(parentEntity.items, childEntityNameOrId);
		if (!childEntity) return `<a class="entity-link broken"><i class="fas fa-unlink"></i> ${displayText || `${parentEntityNameOrId}.${childEntityNameOrId}`}</a>`;

		return `<a class="jlnk__entity-link" data-plut-owned-link="true" data-parent-entity="${parentEntityType}" data-child-entity="Item" data-parent-id="${parentEntity.id}" data-child-id="${childEntity.id}"><i class="${config.sidebarIcon}"></i> <i class="${configChild.sidebarIcon}"></i> ${childEntity.name}</a>`;
	}
};

Patcher_TextEditor.Folder = class extends Patcher_TextEditor.Enricher {
	static getHtml (enrichOpts, depth, fullText, folderNameOrId, displayText) {
		const folder = this._getEntity(CONFIG.Folder.collection.instance, folderNameOrId);

		if (!folder) return `<a class="entity-link broken"><i class="fas fa-unlink"></i> ${displayText || folderNameOrId}</a>`;

		return `<a class="jlnk__entity-link" data-plut-folder-link="true" data-entity="Folder" data-entity-id="${folder.id}"><i class="fas fa-folder fa-fw"></i> ${folder.name}</a>`;
	}
};

Patcher_TextEditor.ContentLoader = class {
	static getHtml (enrichOpts, depth, fullText, tag, pipeParts, displayText) {
		const importerMeta = ChooseImporter.getImporterClassMeta(tag);

		const name = (Renderer.splitTagByPipe(pipeParts)[0] || "");

		if (!importerMeta) return `<a class="entity-link broken" title="Unknown Tag &quot;${tag.qq()}&quot;"><i class="fas fa-unlink"></i> ${StrUtil.qq(displayText || name)}</a>`;

		const {Class: Importer, isViewOnly} = importerMeta;

		const {displayText: displayTextPipe, page, pageHover, source, hash, preloadId, hashPreEncoded, hashHover, hashPreEncodedHover, subhashes, subhashesHover} = Renderer.utils.getTagMeta(`@${tag}`, pipeParts);

		const ptsHover = `data-plut-hover-page="${page.qq()}"
			${pageHover ? `data-plut-hover-page-hover="${pageHover.qq()}"` : ""}
			data-plut-hover-source="${source.qq()}"
			data-plut-hover-hash="${hash.qq()}"
			data-plut-hover-tag="${tag}"
			${preloadId ? `data-plut-hover-preload-id="${preloadId.qq()}"` : ""}
			${hashPreEncoded ? `data-plut-hover-hash-pre-encoded="${hashPreEncoded}"` : ""}
			${hashHover ? `data-plut-hover-hash-hover="${hashHover.qq()}"` : ""}
			${hashPreEncodedHover ? `data-plut-hover-hash-pre-encoded-hover="${hashPreEncodedHover}"` : ""}
			${subhashes?.length ? `data-plut-hover-subhashes="${JSON.stringify(subhashes).qq()}"` : ""}
			${subhashesHover?.length ? `data-plut-hover-subhashes-hover="${JSON.stringify(subhashesHover).qq()}"` : ""}
			${isViewOnly ? `data-plut-hover-is-faux-page="true"` : ""}`;

		if (isViewOnly) {
			return `<span
				class="help help--hover"
				data-plut-hover="${true}"
				${ptsHover}
			>${StrUtil.qq(displayTextPipe || displayText || name)}</span>`;
		}

		const config = CONFIG[Importer.FOLDER_TYPE];

		// (Should never occur)
		if (!config) return `<a class="entity-link broken" title="No CONFIG found for type &quot;${Importer.FOLDER_TYPE}&quot;\u2014this is a bug!"><i class="fas fa-unlink"></i> ${StrUtil.qq(displayText || name)}</a>`;

		return `<a
			class="jlnk__entity-link"
			draggable="true"
			${Config.get("text", "isEnableHoverForLinkTags") ? `data-plut-hover="${true}"` : `title="SHIFT-Click to Import"`}
			${ptsHover}
			data-plut-rich-link="${true}"
			data-plut-rich-link-entity-type="${Importer.FOLDER_TYPE}"
			data-plut-rich-link-original-text="${fullText.slice(1).qq()}"
		><i class="fas ${config.sidebarIcon}"></i> ${StrUtil.qq(displayTextPipe || displayText || name)}</a>`;
	}

	static handleClick (evt) {
		evt.stopPropagation();
		evt.preventDefault();

		// The "@" is stripped to avoid issues when recursively rendering embedded text, so add it back here
		const originalText = `@${evt.currentTarget.dataset.plutRichLinkOriginalText}`;

		const tag = evt.currentTarget.dataset.plutHoverTag;
		const page = evt.currentTarget.dataset.plutHoverPage;
		const source = evt.currentTarget.dataset.plutHoverSource;
		let hash = evt.currentTarget.dataset.plutHoverHash;
		const hashPreEncoded = !!evt.currentTarget.dataset.plutHoverHashPreEncoded;
		const pageHover = evt.currentTarget.dataset.plutHoverPageHover || page;
		let hashHover = evt.currentTarget.dataset.plutHoverHashHover;
		const hashPreEncodedHover = !!evt.currentTarget.dataset.plutHoverHashPreEncodedHover;
		const subhashesHover = evt.currentTarget.dataset.plutHoverSubhashesHover;

		if (!pageHover || !source || !hash) return;

		const importer = ChooseImporter.getImporter(tag) || ChooseImporter.getImporter(page);

		if (!hashPreEncoded) hash = UrlUtil.encodeForHash(hash);
		if (hashHover && !hashPreEncodedHover) hashHover = UrlUtil.encodeForHash(hashHover);
		if (!hashHover) hashHover = hash;

		if (subhashesHover) {
			const parsed = JSON.parse(subhashesHover);
			hashHover += Renderer.utils.getLinkSubhashString(parsed);
		}

		const isPermanent = !!evt.shiftKey
			&& (
				(game.user.can("ACTOR_CREATE") && importer.gameProp === "actors")
				|| (game.user.can("ITEM_CREATE") && importer.gameProp === "items")
				|| (game.user.can("JOURNAL_CREATE") && importer.gameProp === "journal")
				|| (game.user.can("ROLL_TABLE_CREATE") && importer.gameProp === "tables")
			);
		const isPopout = evt.view !== window && Config.get("ui", "isEnableSubPopouts");

		Renderer.hover.pCacheAndGet(pageHover, source, hashHover)
			.then(ent => {
				const msgErrorBase = `Could not load content for tag "${originalText}"!`;

				if (!ent) {
					const msgError = `${msgErrorBase} Could not find matching entity.`;
					console.error(...LGT, msgError);
					return ui.notifications.error(msgError);
				}

				importer.pImportEntry(ent, {isTemp: !isPermanent, defaultPermission: !isPermanent ? CONST.ENTITY_PERMISSIONS.OWNER : undefined})
					.then(async importSummary => {
						if (isPermanent) UtilApplications.doShowImportedNotification(importSummary);

						const renderMetas = await Promise.all(
							(importSummary.imported || [])
								.map(it => it.document)
								.filter(Boolean)
								.map(doc => UtilApplications.pForceRenderApp(doc.sheet ? doc.sheet : doc)),
						);

						if (!isPopout) return;
						renderMetas.filter(Boolean).forEach(({app, data}) => PopoutSheet.doPopout(app, data));
					})
					.catch(err => {
						console.error(...LGT, err);
						ui.notifications.error(`${msgErrorBase} ${VeCt.STR_SEE_CONSOLE}`);
					});
			});
	}
};

/** Drag-and-drop for @tag links. */
Patcher_TextEditor.ContentDragDrop = class {
	static init () {
		UtilLibWrapper.addPatch(
			"ActorSheet.prototype._onDragStart",
			this._lw_ActorSheet_prototype__onDragStart,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);

		UtilLibWrapper.addPatch(
			"TextEditor._onDropEditorData",
			this._lw_TextEditor__onDropEditorData,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);
	}

	static _lw_ActorSheet_prototype__onDragStart (fn, ...args) {
		const evt = args[0];
		if (evt.target.dataset.plutRichLink) return;
		return fn(...args);
	}

	static async _lw_TextEditor__onDropEditorData (fn, ...args) {
		return Patcher_TextEditor.ContentDragDrop._pHandleEditorDrop({fn, args});
	}

	static async _pHandleEditorDrop ({fn, args}) {
		const [evt, editor] = args;
		evt.preventDefault();

		const data = Patcher_TextEditor.ContentDragDrop._getEvtData(evt);
		if (!data) return fn(...args);

		// region Handle drag-drop from importer lists; render these as `@<tag>[...]`s
		if (data?.subType === UtilEvents.EVT_DATA_SUBTYPE__IMPORT) {
			editor.insertContent(data.tag);
			return true;
		}
		// endregion

		// region Based on `TextEditor._onDropEditorData`
		// If we're drag-dropping an actor's sheet item, create an `@ActorEmbeddedItem` link
		if (data.actorId && data.type === "Item" && !data.pack) {
			const config = CONFIG[data.type];
			if (!config) return false;
			const parent = game.actors.get(data.actorId);
			if (!parent) return false;
			const entity = parent[config.documentClass.metadata.collection].get(data.data._id);
			if (!entity) return false;
			editor.insertContent(`@ActorEmbedded${data.type}[${data.actorId}][${entity.id}]{${entity.name}}`);
			return true;
		}
		// endregion

		if (data?.subType !== UtilEvents.EVT_DATA_SUBTYPE__HOVER) return fn(...args);

		editor.insertContent(data.originalText);

		return true;
	}

	static _getEvtData (evt) {
		try {
			return JSON.parse(evt.dataTransfer.getData("text/plain"));
		} catch (e) {
			return null;
		}
	}
};

export {Patcher_TextEditor};
