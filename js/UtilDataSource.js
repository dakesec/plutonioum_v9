import {Vetools} from "./Vetools.js";
import {Config} from "./Config.js";
import {LGT} from "./Util.js";

class UtilDataSource {
	static sortListItems (a, b, o) {
		const ixTypeA = Math.min(...a.values.filterTypes.map(it => UtilDataSource.SOURCE_TYPE_ORDER.indexOf(it)));
		const ixTypeB = Math.min(...b.values.filterTypes.map(it => UtilDataSource.SOURCE_TYPE_ORDER.indexOf(it)));

		return SortUtil.ascSort(ixTypeA, ixTypeB) || SortUtil.compareListNames(a, b);
	}

	static async pGetFileOutputs (source, uploadedFiles) {
		uploadedFiles = uploadedFiles || [];

		const allContent = await Promise.all(uploadedFiles.map(f => {
			return source.pPostLoad ? source.pPostLoad(f, source.userData) : f;
		}));

		return {
			contents: allContent.filter(it => it != null),
		};
	}

	static async pGetUrlOutputs (source, customUrls) {
		if (source.url === "") {
			customUrls = customUrls || [];

			let loadedDatas;
			try {
				loadedDatas = await Promise.all(customUrls.map(async url => {
					const data = await Vetools.pGetWithCache(url);
					return source.pPostLoad ? source.pPostLoad(data, source.userData) : data;
				}));
			} catch (e) {
				ui.notifications.error(`Failed to load one or more URLs! ${VeCt.STR_SEE_CONSOLE}`);
				throw e;
			}

			return {
				cacheKeys: customUrls,
				contents: loadedDatas,
			};
		}

		let data;
		try {
			data = await Vetools.pGetWithCache(source.url);
			if (source.pPostLoad) data = await source.pPostLoad(data, source.userData);
		} catch (e) {
			const msg = `Failed to load URL "${source.url}"!`;
			ui.notifications.error(`${msg} ${VeCt.STR_SEE_CONSOLE}`);
			console.error(msg);
			throw e;
		}
		return {
			cacheKeys: [source.url],
			contents: [data],
		};
	}

	static async pGetSpecialOutput (source) {
		let loadedData;
		try {
			const json = await Vetools.pLoadImporterSourceSpecial(source);
			loadedData = json;
			if (source.pPostLoad) loadedData = await source.pPostLoad(loadedData, json, source.userData);
		} catch (e) {
			ui.notifications.error(`Failed to load pre-defined source "${source.cacheKey}"! ${VeCt.STR_SEE_CONSOLE}`);
			throw e;
		}
		return {
			cacheKeys: [source.cacheKey],
			contents: [loadedData],
		};
	}

	static _PROPS_NO_BLOCKLIST = new Set(["itemProperty", "itemType"]);
	static _PROP_RE_FOUNDRY = /^foundry[A-Z]/;

	static getMergedData (data, {isFilterBlocklisted = true} = {}) {
		const mergedData = {};

		data.forEach(sourceData => {
			Object.entries(sourceData)
				.forEach(([prop, arr]) => {
					if (!arr || !(arr instanceof Array)) return;
					if (mergedData[prop]) mergedData[prop] = [...mergedData[prop], ...MiscUtil.copy(arr)];
					else mergedData[prop] = MiscUtil.copy(arr);
				});
		});

		if (isFilterBlocklisted) {
			Object.entries(mergedData)
				.forEach(([prop, arr]) => {
					if (!arr || !(arr instanceof Array)) return;
					mergedData[prop] = mergedData[prop]
						.filter(it => {
							// Ignore "Generic" entries, as we expect them to be synthetic
							if (SourceUtil.getEntitySource(it) === VeCt.STR_GENERIC) return false;

							if (
								it.__prop
								&& (this._PROPS_NO_BLOCKLIST.has(it.__prop) || this._PROP_RE_FOUNDRY.test(it.__prop))
							) return false;

							// region Sanity checks
							if (!SourceUtil.getEntitySource(it)) {
								console.warn(`Entity did not have a "source"! This should never occur.`);
								return true;
							}
							if (!it.__prop) {
								console.warn(`Entity did not have a "__prop"! This should never occur.`);
								return true;
							}
							if (!UrlUtil.URL_TO_HASH_BUILDER[it.__prop]) {
								console.warn(`No hash builder found for "__prop" "${it.__prop}"! This should never occur.`);
								return true;
							}
							// endregion

							// region Handle specific sub-entities
							switch (it.__prop) {
								case "class": {
									if (!it.subclasses?.length) break;

									it.subclasses = it.subclasses.filter(sc => {
										if (sc.source === VeCt.STR_GENERIC) return false;

										return !ExcludeUtil.isExcluded(
											UrlUtil.URL_TO_HASH_BUILDER["subclass"](sc),
											"subclass",
											sc.source,
											{isNoCount: true},
										);
									});

									break;
								}

								case "item":
								case "baseitem":
								case "itemGroup":
								case "magicvariant":
								case "_specificVariant": {
									return !Renderer.item.isExcluded(it);
								}
							}
							// endregion

							return !ExcludeUtil.isExcluded(
								UrlUtil.URL_TO_HASH_BUILDER[it.__prop](it),
								it.__prop,
								SourceUtil.getEntitySource(it),
								{isNoCount: true},
							);
						});
				});
		}

		return mergedData;
	}

	/**
	 * If data is being loaded in the background, display an info notification if it is taking a long time, to let
	 *   the user know that _something_ is happening.
	 */
	static async pHandleBackgroundLoad ({pLoad, isBackground = false, cntSources = null}) {
		const pTimeout = isBackground ? MiscUtil.pDelay(500, VeCt.SYM_UTIL_TIMEOUT) : null;

		const promises = [pLoad, pTimeout].filter(Boolean);

		const winner = await Promise.race(promises);
		if (winner === VeCt.SYM_UTIL_TIMEOUT) ui.notifications.info(`Please wait while ${cntSources != null ? `${cntSources} source${cntSources === 1 ? " is" : "s are"}` : "data is being"} loaded...`);
		return pLoad;
	}

	static _IGNORED_KEYS = new Set([
		"_meta",
		"$schema",
	]);
	static async pGetAllContent (
		{
			sources,
			uploadedFiles,
			customUrls,
			isBackground = false,
			userData,
			cacheKeys = null,

			// region Dedupe
			page,
			isDedupable = false,
			fnGetDedupedData = null,
			// endregion

			// region Blocklist
			// - `page`
			fnGetBlocklistFilteredData = null,
			// endregion

			// region Helper flags
			isAutoSelectAll = false,
			// endregion
		},
	) {
		const allContent = [];

		if (
			isAutoSelectAll
			&& Config.get("dataSources", "tooManySourcesWarningThreshold") != null
			&& sources.length >= Config.get("dataSources", "tooManySourcesWarningThreshold")
		) {
			const ptHelp = `This may take a (very) long time! If this seems like too much, ${game.user.isGM ? "your GM" : "you"} may have to adjust ${game.user.isGM ? "your" : "the"} "Data Sources" Config options/${game.user.isGM ? "your" : "the"} "World Data Source Selector" list to limit the number of sources selected by default.`;

			console.warn(...LGT, `${sources.length} source${sources.length === 1 ? "" : "s"} are being loaded! ${ptHelp}`);

			if (
				!(await InputUiUtil.pGetUserBoolean({
					title: "Too Many Sources",
					htmlDescription: `You are about to load ${sources.length} source${sources.length === 1 ? "" : "s"}. ${ptHelp}<br>Would you like to load ${sources.length} source${sources.length === 1 ? "" : "s"}?`,
					textNo: "Cancel",
					textYes: "Continue",
				}))
			) return null;
		}

		const pLoad = sources.pMap(async source => {
			if (source.isFile) {
				// Returns an array, as multiple files may be loaded
				const filesContentMeta = await UtilDataSource.pGetFileOutputs(source, uploadedFiles);
				allContent.push(...filesContentMeta.contents);

				// Never cache file loads, as we cannot guarantee the file contents will be the same. This also
				//   prevents any further step from creating a cache key.
				if (cacheKeys) cacheKeys.push(null);
			} else if (source.url != null) {
				// Returns an array, as multiple URLs may be specified for a "custom URL" source
				const urlContentMeta = await UtilDataSource.pGetUrlOutputs(source, customUrls);

				allContent.push(...urlContentMeta.contents);
				if (cacheKeys) cacheKeys.push(...urlContentMeta.cacheKeys);
			} else {
				// Returns a single item
				const specialContentMeta = await UtilDataSource.pGetSpecialOutput(source);
				allContent.push(...specialContentMeta.contents);
				if (cacheKeys) cacheKeys.push(...specialContentMeta.cacheKeys);
			}
		});

		await UtilDataSource.pHandleBackgroundLoad({pLoad, isBackground, cntSources: sources.length});

		// Flatten the content into a single object
		const allContentMerged = {};

		// Some special cases (e.g. adventures/books) expect to pass around a single un-mergeable object; allow this
		if (allContent.length === 1) Object.assign(allContentMerged, allContent[0]);
		else {
			// Otherwise, merge all data arrays into one object
			allContent.forEach(obj => {
				Object.entries(obj)
					.forEach(([k, v]) => {
						if (v == null) return;
						if (this._IGNORED_KEYS.has(k)) return;

						if (!(v instanceof Array)) console.warn(`Could not merge "${typeof v}" for key "${k}"!`);

						allContentMerged[k] = allContentMerged[k] || [];
						allContentMerged[k] = [...allContentMerged[k], ...v];
					});
			});
		}

		let dedupedAllContentMerged = fnGetDedupedData
			? fnGetDedupedData({allContentMerged, isDedupable})
			: this._getDedupedAllContentMerged({allContentMerged, isDedupable});

		dedupedAllContentMerged = fnGetBlocklistFilteredData
			? fnGetBlocklistFilteredData({dedupedAllContentMerged, page})
			: this._getBlocklistFilteredData({dedupedAllContentMerged, page});

		if (Config.get("import", "isShowVariantsInLists")) {
			Object.entries(dedupedAllContentMerged)
				.forEach(([k, arr]) => {
					if (!(arr instanceof Array)) return;
					dedupedAllContentMerged[k] = arr
						.map(it => [it, ...DataUtil.proxy.getVersions(it.__prop, it)])
						.flat();
				});
		}

		Object.entries(dedupedAllContentMerged)
			.forEach(([k, arr]) => {
				if (!(arr instanceof Array)) return;
				if (!arr.length) delete dedupedAllContentMerged[k];
			});

		return {dedupedAllContentMerged, cacheKeys, userData};
	}

	static _getBlocklistFilteredData ({dedupedAllContentMerged, page}) {
		if (!UrlUtil.URL_TO_HASH_BUILDER[page]) return dedupedAllContentMerged;
		dedupedAllContentMerged = {...dedupedAllContentMerged};
		Object.entries(dedupedAllContentMerged)
			.forEach(([k, arr]) => {
				if (!(arr instanceof Array)) return;
				dedupedAllContentMerged[k] = arr.filter(it => {
					if (it.source === VeCt.STR_GENERIC) return false;

					// region Sanity checks
					if (!SourceUtil.getEntitySource(it)) {
						console.warn(`Entity did not have a "source"! This should never occur.`);
						return true;
					}
					if (!it.__prop) {
						console.warn(`Entity did not have a "__prop"! This should never occur.`);
						return true;
					}
					// endregion

					// region Handle specific sub-entities
					switch (it.__prop) {
						case "item":
						case "baseitem":
						case "itemGroup":
						case "magicvariant":
						case "_specificVariant": {
							return !Renderer.item.isExcluded(it);
						}
					}
					// endregion

					return !ExcludeUtil.isExcluded(
						(UrlUtil.URL_TO_HASH_BUILDER[it.__prop] || UrlUtil.URL_TO_HASH_BUILDER[page])(it),
						it.__prop,
						SourceUtil.getEntitySource(it),
						{isNoCount: true},
					);
				});
			});
		return dedupedAllContentMerged;
	}

	static _getDedupedAllContentMerged ({allContentMerged, page, isDedupable = false}) {
		if (!isDedupable) return allContentMerged;
		return this._getDedupedData({allContentMerged, page});
	}

	static _getDedupedData ({allContentMerged, page}) {
		if (!UrlUtil.URL_TO_HASH_BUILDER[page]) return allContentMerged;

		const contentHashes = new Set();
		Object.entries(allContentMerged)
			.forEach(([k, arr]) => {
				if (!(arr instanceof Array)) return;
				allContentMerged[k] = arr.filter(it => {
					const fnGetHash = UrlUtil.URL_TO_HASH_BUILDER[page];
					if (!fnGetHash) return true;
					const hash = fnGetHash(it);
					if (contentHashes.has(hash)) return false;
					contentHashes.add(hash);
					return true;
				});
			});

		return allContentMerged;
	}
}

UtilDataSource.SOURCE_TYP_OFFICIAL_BASE = "Official";
UtilDataSource.SOURCE_TYP_OFFICIAL_ALL = `${UtilDataSource.SOURCE_TYP_OFFICIAL_BASE} (All)`;
UtilDataSource.SOURCE_TYP_OFFICIAL_SINGLE = `${UtilDataSource.SOURCE_TYP_OFFICIAL_BASE} (Single Source)`;
UtilDataSource.SOURCE_TYP_CUSTOM = "Custom/User";
UtilDataSource.SOURCE_TYP_ARCANA = "UA/Etc.";
UtilDataSource.SOURCE_TYP_BREW = "Homebrew";
UtilDataSource.SOURCE_TYP_BREW_LOCAL = "Local Homebrew";
UtilDataSource.SOURCE_TYP_UNKNOWN = "Unknown";

UtilDataSource.SOURCE_TYPE_ORDER = [
	UtilDataSource.SOURCE_TYP_OFFICIAL_ALL,
	UtilDataSource.SOURCE_TYP_CUSTOM,
	UtilDataSource.SOURCE_TYP_OFFICIAL_SINGLE,
	UtilDataSource.SOURCE_TYP_ARCANA,
	UtilDataSource.SOURCE_TYP_BREW_LOCAL,
	UtilDataSource.SOURCE_TYP_BREW,
	UtilDataSource.SOURCE_TYP_UNKNOWN,
];

UtilDataSource.SOURCE_TYPE_ORDER__FILTER = [ // Order used in filter sorting
	UtilDataSource.SOURCE_TYP_OFFICIAL_ALL,
	UtilDataSource.SOURCE_TYP_OFFICIAL_SINGLE,
	UtilDataSource.SOURCE_TYP_ARCANA,
	UtilDataSource.SOURCE_TYP_BREW_LOCAL,
	UtilDataSource.SOURCE_TYP_BREW,
	UtilDataSource.SOURCE_TYP_CUSTOM,
	UtilDataSource.SOURCE_TYP_UNKNOWN,
];

UtilDataSource.DataSourceBase = class {
	/**
	 * @param name Source name.
	 * @param [opts] Options object.
	 * @param [opts.pPostLoad] Data modifier.
	 * @param [opts.filterTypes]
	 * @param [opts.isDefault]
	 * @param [opts.abbreviations]
	 * @param [opts.isWorldSelectable] If this source should be selectable using the World Data Source Selector app.
	 */
	constructor (name, opts) {
		this.name = name;

		this.pPostLoad = opts.pPostLoad;
		this.filterTypes = opts.filterTypes || [UtilDataSource.SOURCE_TYP_UNKNOWN];
		this.isDefault = !!opts.isDefault;
		this.abbreviations = opts.abbreviations;
		this.isWorldSelectable = !!opts.isWorldSelectable;
	}

	get identifier () { throw new Error(`Unimplemented!`); }
	get identifierWorld () { return this.isDefault ? "5etools" : this.identifier; }
};

UtilDataSource.DataSourceUrl = class extends UtilDataSource.DataSourceBase {
	/**
	 * @param name Source name.
	 * @param url Source URL.
	 * @param [opts] Options object.
	 * @param [opts.source] Source identifier.
	 * @param [opts.pPostLoad] Data modifier.
	 * @param [opts.userData] Additional data to pass through to the loadee.
	 * @param [opts.filterTypes]
	 * @param [opts.icon]
	 * @param [opts.isDefault]
	 * @param [opts.abbreviations]
	 */
	constructor (name, url, opts) {
		opts = opts || {};

		super(name, {isWorldSelectable: !!url, ...opts});

		this.url = url;
		this.source = opts.source;
		this.userData = opts.userData;
	}

	get identifier () { return this.url === "" ? `VE_SOURCE_CUSTOM_URL` : this.url; }
	get identifierWorld () { return this.source ?? super.identifierWorld; }
};

UtilDataSource.DataSourceFile = class extends UtilDataSource.DataSourceBase {
	/**
	 * @param name Source name.
	 * @param [opts] Options object.
	 * @param [opts.pPostLoad] Data modifier.
	 * @param [opts.filterTypes]
	 * @param [opts.isDefault]
	 * @param [opts.abbreviations]
	 */
	constructor (name, opts) {
		opts = opts || {};

		super(name, {isWorldSelectable: false, ...opts});

		this.isFile = true;
	}

	get identifier () { return `VE_SOURCE_CUSTOM_FILE`; }
};

UtilDataSource.DataSourceSpecial = class extends UtilDataSource.DataSourceBase {
	/**
	 * @param name Source name.
	 * @param pGet Data getter.
	 * @param opts Options object.
	 * @param opts.cacheKey Cache key to store the pGet data under.
	 * @param [opts.pPostLoad] Data modifier.
	 * @param [opts.filterTypes]
	 * @param [opts.isDefault]
	 * @param [opts.abbreviations]
	 */
	constructor (name, pGet, opts) {
		opts = opts || {};

		super(name, {isWorldSelectable: true, ...opts});

		this.special = {pGet};
		if (!opts.cacheKey) throw new Error(`No cache key specified!`);
		this.cacheKey = opts.cacheKey;
	}

	get identifier () { return this.cacheKey; }
};

export {UtilDataSource};
