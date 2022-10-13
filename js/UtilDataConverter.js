import {Config} from "./Config.js";
import {Vetools} from "./Vetools.js";
import {Consts} from "./Consts.js";
import {SharedConsts} from "../shared/SharedConsts.js";

class UtilDataConverter {
	static getNameWithSourcePart (ent, {displayName = null, isActorItem = false} = {}) {
		return `${displayName || `${ent.type === "variant" ? "Variant: " : ""}${Renderer.stripTags(ent._displayName || ent.name || "")}`}${!isActorItem && ent.source && Config.get("import", "isAddSourceToName") ? ` (${Parser.sourceJsonToAbv(ent.source)})` : ""}`;
	}

	static getSourceWithPagePart (ent) {
		return `${Parser.sourceJsonToAbv(ent.source)}${Config.get("import", "isAddPageNumberToSource") && ent.page ? `${UtilDataConverter.SOURCE_PAGE_PREFIX}${ent.page}` : ""}`;
	}

	static async pGetItemWeaponType (uid) {
		uid = uid.toLowerCase().trim();

		if (UtilDataConverter.WEAPONS_MARTIAL.includes(uid)) return "martial";
		if (UtilDataConverter.WEAPONS_SIMPLE.includes(uid)) return "simple";

		let [name, source] = Renderer.splitTagByPipe(uid);
		source = source || "phb";
		const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS]({name, source});

		if (Renderer.hover.isCached(UrlUtil.PG_ITEMS, source, hash)) return Renderer.hover.getFromCache(UrlUtil.PG_ITEMS, source, hash)?.weaponCategory;

		// If the item *probably* isn't available, return null. This prevents us from re-running the cache if we're
		//   looking for e.g. a string which isn't an item UID.
		if (Renderer.hover.isPageSourceCached(UrlUtil.PG_ITEMS, source)) return null;

		// If we've yet to attempt to load this source, load the item, and hopefully return the type
		const found = await Renderer.hover.pCacheAndGet(UrlUtil.PG_ITEMS, source, hash);
		return found?.weaponCategory;
	}

	static async _pGetClassSubclass_pInitCache ({cache}) {
		cache = cache || {};
		if (!cache._allClasses && !cache._allSubclasses) {
			const classData = await DataUtil.class.loadJSON();
			const brew = await BrewUtil2.pGetBrewProcessed();
			cache._allClasses = [...(classData.class || []), ...(brew?.class || [])];
			cache._allSubclasses = [...(classData.subclass || []), ...(brew?.subclass || [])];
		}
		return cache;
	}

	static async pGetClassItemClassAndSubclass ({sheetItem, subclassSheetItems, cache = null} = {}) {
		cache = await this._pGetClassSubclass_pInitCache({cache});

		const nameLowerClean = sheetItem.name.toLowerCase().trim();
		const sourceLowerClean = (UtilDataConverter.getItemSource(sheetItem).source || "").toLowerCase();

		const matchingClasses = cache._allClasses.filter(cls =>
			cls.name.toLowerCase() === nameLowerClean
				&& (
					!Config.get("import", "isStrictMatching")
					|| sourceLowerClean === Parser.sourceJsonToAbv(cls.source).toLowerCase()
				),
		);
		if (!matchingClasses.length) return {matchingClasses: [], matchingSubclasses: [], sheetItem};

		if (!subclassSheetItems?.length) return {matchingClasses, matchingSubclasses: [], sheetItem};

		const matchingSubclasses = matchingClasses
			.map(cls => {
				const classSubclassSheetItems = subclassSheetItems.filter(scItem => scItem.data.data.classIdentifier === sheetItem.data.data.identifier);
				return cache._allSubclasses.filter(sc => {
					if (sc.className !== cls.name || sc.classSource !== cls.source) return false;

					return classSubclassSheetItems.some(scItem =>
						sc.name.toLowerCase() === scItem.name.toLowerCase().trim()
						&& (
							!Config.get("import", "isStrictMatching")
							|| (UtilDataConverter.getItemSource(scItem).source || "").toLowerCase() === Parser.sourceJsonToAbv(sc.source).toLowerCase()
						),
					);
				});
			})
			.flat();

		return {matchingClasses, matchingSubclasses, sheetItem};
	}

	static getItemSource (itm) {
		if (itm.data.flags?.[SharedConsts.MODULE_NAME_FAKE]?.source) {
			return {
				source: itm.data.flags?.[SharedConsts.MODULE_NAME_FAKE]?.source,
				isExact: true,
			};
		}

		let data = itm.data || {};
		if (data.data) data = data.data;
		let rawSource = data.source;

		// region vtta-dndbeyond workaround
		// This is invalid, but as of 2020-12-15, vtta-dndbeyond can create an array of sources on race items on imported
		//   characters. Tolerate it.
		if (rawSource instanceof Array) rawSource = rawSource[0];
		// endregion

		if (!rawSource) return {source: null};

		const source = rawSource.split(UtilDataConverter._SOURCE_PAGE_PREFIX_RE)[0].trim();
		return {
			source,
			isExact: false,
		};
	}

	static getSpellPointTotal ({totalSpellcastingLevels}) {
		if (!totalSpellcastingLevels) return 0;

		const spellSlotCounts = UtilDataConverter.CASTER_TYPE_TO_PROGRESSION.full[totalSpellcastingLevels - 1]
			|| UtilDataConverter.CASTER_TYPE_TO_PROGRESSION.full[0];

		return spellSlotCounts
			.map((countSlots, ix) => {
				const spellLevel = ix + 1;
				return Parser.spLevelToSpellPoints(spellLevel) * countSlots;
			})
			.sum();
	}

	static getPsiPointTotal ({totalMysticLevels}) {
		if (!totalMysticLevels || isNaN(totalMysticLevels) || totalMysticLevels < 0) return 0;

		totalMysticLevels = Math.round(Math.min(totalMysticLevels, Consts.CHAR_MAX_LEVEL));

		return [4, 6, 14, 17, 27, 32, 38, 44, 57, 64, 64, 64, 64, 64, 64, 64, 64, 71, 71, 71][totalMysticLevels - 1];
	}

	// region Description rendering
	static async pGetWithDescriptionPlugins (pFn, {actorId = null, tagHashItemIdMap = null} = {}) {
		const hkLink = (entry, procHash) => this._pGetWithDescriptionPlugins_fnPlugin(entry, procHash);
		const hkStr = (tag, text) => {
			const inn = `{${tag} ${text}}`;
			const itemId = this._pGetWithDescriptionPlugins_getTagItemId({tag, text, tagHashItemIdMap});
			const out = this._getConvertedTagLinkString(inn, {actorId, itemId});
			if (inn === out) return null; // If no changes were made, return `null`, to fall back on regular rendering.
			return out;
		};
		const hkImg = (entry, url) => {
			const out = Vetools.getImageSavedToServerUrl({originalUrl: url});
			// Always assume the image download/save worked--if not, the user will have to deal with it.
			//
			//   The reasoning for this is as follows:
			//
			//     We cannot use async code inside the renderer, as this would mean a complete re-write. Therefore, we
			//   would have to modify the entries _before_ they hit the renderer. This is not sustainable, as the renderer
			//   itself is allowed to create its own entries internally/etc.; we have to use plugins to ensure the entries
			//   we care about are always processed correctly.
			//
			//     We could instead find-replace the results of the wrapped callback function, below, as we assume it is a
			//   string. This is a horrible hack, however, and forces us to e.g. regex for known image file extensions.
			//
			//     In the absence of other solutions, we optimistically assume the download will always work. :)
			Vetools.pSaveImageToServerAndGetUrl({originalUrl: url, force: true}).then(null).catch(() => {});
			return out;
		};

		Renderer.get().addPlugin("link_attributesHover", hkLink);
		if (Config.get("import", "isRenderLinksAsTags")) Renderer.get().addPlugin("string_tag", hkStr);
		if (Config.get("import", "isSaveImagesToServer")) {
			Renderer.get().addPlugin("image_urlPostProcess", hkImg);
			Renderer.get().addPlugin("image_urlThumbnailPostProcess", hkImg);
		}

		let out;
		try {
			out = await pFn();
		} finally {
			Renderer.get().removePlugin("link_attributesHover", hkLink);
			Renderer.get().removePlugin("string_tag", hkStr);
			Renderer.get().removePlugin("image_urlPostProcess", hkImg);
			Renderer.get().removePlugin("image_urlThumbnailPostProcess", hkImg);
		}

		return out;
	}

	/**
	 * Fetch a possible actor item ID for a given tag, e.g. when mapping creature spell sections.
	 */
	static _pGetWithDescriptionPlugins_getTagItemId ({tag, text, tagHashItemIdMap}) {
		const tagName = tag.slice(1); // slice to remove leading `@`
		if (!tagHashItemIdMap?.[tagName]) return null;
		const defaultSource = Parser.TAG_TO_DEFAULT_SOURCE[tagName];
		if (!defaultSource) return null;
		const page = Renderer.hover.TAG_TO_PAGE[tagName];
		if (!page) return null;
		const hashBuilder = UrlUtil.URL_TO_HASH_BUILDER[page];
		if (!hashBuilder) return null;
		let [name, source] = text.split("|");
		source = source || defaultSource;
		const hash = hashBuilder({name, source});
		return tagHashItemIdMap?.[tagName]?.[hash];
	}

	static _pGetWithDescriptionPlugins_fnPlugin (entry, procHash) {
		const page = entry.href.hover.page;
		const source = entry.href.hover.source;
		const hash = procHash;
		const preloadId = entry.href.hover.preloadId;
		return {
			attributesHoverReplace: [
				`data-plut-hover="${true}" data-plut-hover-page="${page.qq()}" data-plut-hover-source="${source.qq()}" data-plut-hover-hash="${hash.qq()}" ${preloadId ? `data-plut-hover-preload-id="${preloadId.qq()}"` : ""}`,
			],
		};
	}

	// region Replace entity links with @<tag>s
	static _getConvertedTagLinkString (str, {actorId, itemId} = {}) {
		this._getConvertedTagLinkString_initLinkTagMetas();
		for (const {tag, re} of this._LINK_TAG_METAS_REPLACE) str = str.replace(re, (...m) => this._replaceEntityLinks_getReplacement({tag, text: m.last().text, actorId, itemId}));
		for (const {tag, re} of this._LINK_TAG_METAS_REMOVE) str = str.replace(re, (...m) => this._replaceEntityLinks_getRemoved({tag, text: m.last().text}));
		return str;
	}

	static _LINK_TAGS_TO_REMOVE = new Set([
		"quickref", // Avoid converting quickref links, as they don't have a useful mapping
	]);
	static _LINK_TAG_METAS_REPLACE = null;
	static _LINK_TAG_METAS_REMOVE = null;

	static _getConvertedTagLinkString_initLinkTagMetas () {
		if (!this._LINK_TAG_METAS_REPLACE) {
			this._LINK_TAG_METAS_REPLACE = Object.keys(Parser.TAG_TO_DEFAULT_SOURCE)
				.filter(tag => !this._LINK_TAGS_TO_REMOVE.has(tag))
				.map(tag => ({tag, re: this._getConvertedTagLinkString_getRegex({tag})}));
		}

		if (!this._LINK_TAG_METAS_REMOVE) {
			this._LINK_TAG_METAS_REMOVE = Object.keys(Parser.TAG_TO_DEFAULT_SOURCE)
				.filter(tag => this._LINK_TAGS_TO_REMOVE.has(tag))
				.map(tag => ({tag, re: this._getConvertedTagLinkString_getRegex({tag})}));
		}
	}

	static _getConvertedTagLinkString_getRegex ({tag}) { return RegExp(`^{@${tag} (?<text>[^}]+)}$`, "g"); }

	static getConvertedTagLinkEntries (entries) {
		if (!entries) return entries;

		return UtilDataConverter.WALKER_GENERIC.walk(
			MiscUtil.copy(entries),
			{
				string: str => {
					const textStack = [""];
					this._getConvertedTagLinkEntries_recurse(str, textStack);
					return textStack.join("");
				},
			},
		);
	}

	// Based on `Renderer._renderString`
	static _getConvertedTagLinkEntries_recurse (str, textStack) {
		const tagSplit = Renderer.splitByTags(str);
		const len = tagSplit.length;
		for (let i = 0; i < len; ++i) {
			const s = tagSplit[i];
			if (!s) continue;

			// For tags, try to convert them. If we can, use the converted string. If not, recurse.
			if (s.startsWith("{@")) {
				const converted = this._getConvertedTagLinkString(s);

				if (converted !== s) {
					textStack[0] += (converted);
					continue;
				}

				textStack[0] += s.slice(0, 1);
				this._getConvertedTagLinkEntries_recurse(s.slice(1, -1), textStack);
				textStack[0] += s.slice(-1);

				continue;
			}

			textStack[0] += s;
		}
	}

	static _replaceEntityLinks_getReplacement ({tag, text, actorId, itemId}) {
		if (actorId && itemId) {
			const [, , displayText] = text.split("|");
			return `@ActorEmbeddedItem[${actorId}][${itemId}]${displayText ? `{${displayText}}` : ""}`;
		}
		return `@${tag}[${text}]`;
	}

	static _replaceEntityLinks_getRemoved ({tag, text}) {
		return Renderer.stripTags(`{@${tag} ${text}}`);
	}

	/** Async string find-replace. (Unused). */
	static async _pReplaceEntityLinks_pReplace ({str, re, tag}) {
		let m;
		while ((m = re.exec(str))) {
			const prefix = str.slice(0, m.index);
			const suffix = str.slice(re.lastIndex);
			const replacement = this._replaceEntityLinks_getReplacement({tag, m});
			str = `${prefix}${replacement}${suffix}`;
			re.lastIndex = prefix.length + replacement.length;
		}
		return str;
	}
	// endregion

	// endregion

	static _RECHARGE_TYPES = {
		"round": null,
		"restShort": "sr",
		"restLong": "lr",
		"dawn": "day",
		"dusk": "day",
		"midnight": "day",
		"special": null,
	};

	static getFvttUsesPer (it, {isStrict = true} = {}) {
		if (isStrict && !this._RECHARGE_TYPES[it]) return null;
		return Parser._parse_aToB(this._RECHARGE_TYPES, it);
	}
}
UtilDataConverter.WALKER_READONLY_GENERIC = MiscUtil.getWalker({isNoModification: true, keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST});
UtilDataConverter.WALKER_GENERIC = MiscUtil.getWalker({keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST});
UtilDataConverter.SOURCE_PAGE_PREFIX = " pg. ";
UtilDataConverter._SOURCE_PAGE_PREFIX_RE = new RegExp(`${UtilDataConverter.SOURCE_PAGE_PREFIX}\\d+`);

UtilDataConverter.WEAPONS_MARTIAL = [
	"battleaxe|phb",
	"blowgun|phb",
	"flail|phb",
	"glaive|phb",
	"greataxe|phb",
	"greatsword|phb",
	"halberd|phb",
	"hand crossbow|phb",
	"heavy crossbow|phb",
	"lance|phb",
	"longbow|phb",
	"longsword|phb",
	"maul|phb",
	"morningstar|phb",
	"net|phb",
	"pike|phb",
	"rapier|phb",
	"scimitar|phb",
	"shortsword|phb",
	"trident|phb",
	"war pick|phb",
	"warhammer|phb",
	"whip|phb",
];
UtilDataConverter.WEAPONS_SIMPLE = [
	"club|phb",
	"dagger|phb",
	"dart|phb",
	"greatclub|phb",
	"handaxe|phb",
	"javelin|phb",
	"light crossbow|phb",
	"light hammer|phb",
	"mace|phb",
	"quarterstaff|phb",
	"shortbow|phb",
	"sickle|phb",
	"sling|phb",
	"spear|phb",
];

UtilDataConverter.CASTER_TYPE_TO_PROGRESSION = {
	"full": [
		[2, 0, 0, 0, 0, 0, 0, 0, 0],
		[3, 0, 0, 0, 0, 0, 0, 0, 0],
		[4, 2, 0, 0, 0, 0, 0, 0, 0],
		[4, 3, 0, 0, 0, 0, 0, 0, 0],
		[4, 3, 2, 0, 0, 0, 0, 0, 0],
		[4, 3, 3, 0, 0, 0, 0, 0, 0],
		[4, 3, 3, 1, 0, 0, 0, 0, 0],
		[4, 3, 3, 2, 0, 0, 0, 0, 0],
		[4, 3, 3, 3, 1, 0, 0, 0, 0],
		[4, 3, 3, 3, 2, 0, 0, 0, 0],
		[4, 3, 3, 3, 2, 1, 0, 0, 0],
		[4, 3, 3, 3, 2, 1, 0, 0, 0],
		[4, 3, 3, 3, 2, 1, 1, 0, 0],
		[4, 3, 3, 3, 2, 1, 1, 0, 0],
		[4, 3, 3, 3, 2, 1, 1, 1, 0],
		[4, 3, 3, 3, 2, 1, 1, 1, 0],
		[4, 3, 3, 3, 2, 1, 1, 1, 1],
		[4, 3, 3, 3, 3, 1, 1, 1, 1],
		[4, 3, 3, 3, 3, 2, 1, 1, 1],
		[4, 3, 3, 3, 3, 2, 2, 1, 1],
	],
	"artificer": [
		[2, 0, 0, 0, 0],
		[2, 0, 0, 0, 0],
		[3, 0, 0, 0, 0],
		[3, 0, 0, 0, 0],
		[4, 2, 0, 0, 0],
		[4, 2, 0, 0, 0],
		[4, 3, 0, 0, 0],
		[4, 3, 0, 0, 0],
		[4, 3, 2, 0, 0],
		[4, 3, 2, 0, 0],
		[4, 3, 3, 0, 0],
		[4, 3, 3, 0, 0],
		[4, 3, 3, 1, 0],
		[4, 3, 3, 1, 0],
		[4, 3, 3, 2, 0],
		[4, 3, 3, 2, 0],
		[4, 3, 3, 3, 1],
		[4, 3, 3, 3, 1],
		[4, 3, 3, 3, 2],
		[4, 3, 3, 3, 2],
	],
	"1/2": [
		[0, 0, 0, 0, 0],
		[2, 0, 0, 0, 0],
		[3, 0, 0, 0, 0],
		[3, 0, 0, 0, 0],
		[4, 2, 0, 0, 0],
		[4, 2, 0, 0, 0],
		[4, 3, 0, 0, 0],
		[4, 3, 0, 0, 0],
		[4, 3, 2, 0, 0],
		[4, 3, 2, 0, 0],
		[4, 3, 3, 0, 0],
		[4, 3, 3, 0, 0],
		[4, 3, 3, 1, 0],
		[4, 3, 3, 1, 0],
		[4, 3, 3, 2, 0],
		[4, 3, 3, 2, 0],
		[4, 3, 3, 3, 1],
		[4, 3, 3, 3, 1],
		[4, 3, 3, 3, 2],
		[4, 3, 3, 3, 2],
	],
	"1/3": [
		[0, 0, 0, 0],
		[0, 0, 0, 0],
		[2, 0, 0, 0],
		[3, 0, 0, 0],
		[3, 0, 0, 0],
		[3, 0, 0, 0],
		[4, 2, 0, 0],
		[4, 2, 0, 0],
		[4, 2, 0, 0],
		[4, 3, 0, 0],
		[4, 3, 0, 0],
		[4, 3, 0, 0],
		[4, 3, 2, 0],
		[4, 3, 2, 0],
		[4, 3, 2, 0],
		[4, 3, 3, 0],
		[4, 3, 3, 0],
		[4, 3, 3, 0],
		[4, 3, 3, 1],
		[4, 3, 3, 1],
	],
	"pact": [
		[1, 0, 0, 0, 0],
		[2, 0, 0, 0, 0],
		[0, 2, 0, 0, 0],
		[0, 2, 0, 0, 0],
		[0, 0, 2, 0, 0],
		[0, 0, 2, 0, 0],
		[0, 0, 0, 2, 0],
		[0, 0, 0, 2, 0],
		[0, 0, 0, 0, 2],
		[0, 0, 0, 0, 2],
		[0, 0, 0, 0, 3],
		[0, 0, 0, 0, 3],
		[0, 0, 0, 0, 3],
		[0, 0, 0, 0, 3],
		[0, 0, 0, 0, 3],
		[0, 0, 0, 0, 3],
		[0, 0, 0, 0, 4],
		[0, 0, 0, 0, 4],
		[0, 0, 0, 0, 4],
		[0, 0, 0, 0, 4],
	],
};

export {UtilDataConverter};
