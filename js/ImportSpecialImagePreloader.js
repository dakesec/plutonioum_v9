import {SharedConsts} from "../shared/SharedConsts.js";
import {UtilApplications} from "./UtilApplications.js";
import {Vetools} from "./Vetools.js";

class ImportSpecialImagePreloader extends Application {
	static APP_TITLE = "Importer Image Preloader";

	constructor () {
		super(
			{
				title: ImportSpecialImagePreloader.APP_TITLE,
				template: `${SharedConsts.MODULE_LOCATION}/template/ImportSpecialImagePreloader.hbs`,
				width: 640,
				height: 360,
				resizable: true,
			},
		);
		this._comp = null;
	}

	activateListeners ($html) {
		super.activateListeners($html);

		const $stgTop = $html.find(`[data-name="wrp-top"]`);
		const $stgMid = $html.find(`[data-name="wrp-mid"]`);

		this._comp = new _ImportSpecialImagePreloaderComp();

		this._comp.render({$stgTop, $stgMid});

		UtilApplications.autoResizeApplication(this);
	}
}

class _ImportSpecialImagePreloaderComp extends BaseComponent {
	static _EXTS_IMG = new Set(["jpg", "jpeg", "png", "webp", "bmp"]);

	static _Render = class {
		constructor () {
			this.$iptToken = null;
			this.linksDirs = [];
		}
	};

	render ({$stgTop, $stgMid}) {
		const render = new this.constructor._Render();

		this._render_top({render, $stgTop});
		this._render_mid({render, $stgMid});
	}

	_render_top ({render, $stgTop}) {
		render.$iptToken = ComponentUiUtil.$getIptStr(this, "ghToken");

		$$($stgTop)`
			<div class="ve-flex-col">
				<div class="mb-2">To make use of this tool, you must first create a <b>GitHub Personal access token</b>. This increases the number of requests you can make to GitHub, where the images are stored, from 60/hour to 5,000/hour.</div>

				<ol>
					<li>(Create a <a href="https://github.com/" target="_blank">GitHub account</a>)</li>
					<li>Go to your <a href="https://github.com/settings/tokens" target="_blank">GitHub Developer settings</a> &rarr; <code>Personal access tokens</code></li>
					<li>
						<code>Generate a new token</code>. Enter e.g. &quot;Image Downloader&quot; as the <code>Note</code>, and set the <code>Expiration</code> to &quot;<span title="Or less, if you prefer. Since we're not enabling any scopes, the token we generate is &quot;harmless.&quot;" class="help--hover">Never</span>&quot;. Scroll to the bottom of the page (<b>do not</b> enable any scopes) and <code>Generate Token</code>.
					</li>
					<li>Copy the token (<code>ghp_...</code>) and enter it below. <b>Keep a note of your token</b> so you can re-use it in future!</li>
				</ol>

				<div class="ve-flex-col">
					<label class="ve-flex-v-center">
						<div class="mr-2 no-shrink">GitHub <code>Personal access token</code></div>
						${render.$iptToken}
					</label>
				</div>
			</div>
		`;
	}

	_render_mid ({render, $stgMid}) {
		const $iptRepoUrl = ComponentUiUtil.$getIptStr(this, "ghRepoUrl");

		const $dispsCntLinks = [$(`<div class="mr-2"></div>`), $(`<div class="mr-2"></div>`)];
		const hkLinks = () => $dispsCntLinks.forEach($dispsCntLink => $dispsCntLink.text(this._state.linksFiles.length));
		this._addHookBase("linksFiles", hkLinks);
		hkLinks();

		const $dispCntDownloads = $(`<div class="mr-1"></div>`);
		const hkCntDownloads = () => $dispCntDownloads.text(this._state.linksFilesDownloaded.length);
		this._addHookBase("linksFilesDownloaded", hkCntDownloads);
		hkCntDownloads();

		const $btnStartStopLinks = $(`<button class="btn btn-5et btn-xs"></button>`)
			.click(() => {
				if (!this._state.isRunningLinks) {
					this._state.isRunningLinks = !this._state.isRunningLinks;
					if (!this._state.ghToken) return ui.notifications.error(`You must enter a GitHub Personal access token first!`);
					if (!this._state.ghRepoUrl) return ui.notifications.error(`You must enter a GitHub API URL first!`);
					return this._pFetchLinks(render);
				}
				this._state.isRunningLinks = !this._state.isRunningLinks;
			});
		const hkIsRunningLinks = () => {
			$btnStartStopLinks.html(this._state.isRunningLinks ? `<i class="fa fa-pause"></i> Pause` : `<i class="fa fa-play"></i> Fetch`);
			$iptRepoUrl.prop("disabled", this._state.isRunningLinks);
			render.$iptToken.prop("disabled", this._state.isRunningLinks);
		};
		this._addHookBase("isRunningLinks", hkIsRunningLinks);
		hkIsRunningLinks();

		const $btnStartStopDownloads = $(`<button class="btn btn-5et btn-xs"></button>`)
			.click(() => {
				if (!this._state.isRunningDownloads) {
					this._state.isRunningDownloads = !this._state.isRunningDownloads;
					return this._pDownloadLinks();
				}
				this._state.isRunningDownloads = !this._state.isRunningDownloads;
			});
		const hkIsRunningDownloads = () => $btnStartStopDownloads.html(this._state.isRunningDownloads ? `<i class="fa fa-pause"></i> Pause` : `<i class="fa fa-play"></i> Download`);
		this._addHookBase("isRunningDownloads", hkIsRunningDownloads);
		hkIsRunningDownloads();

		$$($stgMid)`<div class="ve-flex-col">
			<div class="ve-flex-col mb-2">
				<label class="ve-flex-v-center">
					<div class="mr-2 no-shrink">GitHub API URL</code></div>
					${$iptRepoUrl}
				</label>
			</div>

			<div class="ve-flex-v-center mb-2">
				<div class="mr-2 bold">Links:</div>
				${$dispsCntLinks[0]}
				${$btnStartStopLinks}
			</div>

			<div class="ve-flex-v-center">
				<div class="mr-2 bold">Downloads:</div>
				${$dispCntDownloads}
				<div class="mr-1">/</div>
				${$dispsCntLinks[1]}
				${$btnStartStopDownloads}
			</div>
		</div>`;
	}

	async _pFetchLinks (render) {
		if (!this._state.linksFiles.length && !render.linksDirs.length) {
			const {urlsDirs, urlsFiles} = await this._pFetchLinks_pFetchDir(this._state.ghRepoUrl);
			render.linksDirs.push(...urlsDirs);
			this._state.linksFiles = [...urlsFiles];
		}

		const workers = [...new Array(8)]
			.map(async () => {
				while (render.linksDirs.length) {
					const url = render.linksDirs.pop();
					const {urlsDirs, urlsFiles} = await this._pFetchLinks_pFetchDir(url);
					render.linksDirs.push(...urlsDirs);
					this._state.linksFiles = [...this._state.linksFiles, ...urlsFiles];
					if (!this._state.isRunningLinks) break;
				}
			});

		await Promise.all(workers);

		if (this._state.isRunningLinks) this._state.isRunningLinks = false;
	}

	async _pFetchLinks_pFetchDir (url) {
		const resp = await fetch(
			url,
			{
				headers: {
					Authorization: `token ${this._state.ghToken}`,
				},
			},
		);

		const json = await resp.json();

		if (json.message) {
			ui.notifications.error(json.message);
			console.error(json.message);
			return {urlsDirs: [], urlsFiles: []};
		}

		const [dirs, files] = json
			.filter(it => it.type === "dir" || this.constructor._EXTS_IMG.has((it.name || "").split(".").last().trim().toLowerCase()))
			.map(it => it.type === "dir"
				? ({type: it.type, url: it.url})
				: ({type: it.type, url: this.constructor._getImageDownloadUrl(it.download_url)}),
			)
			.filter(it => it.type && it.url)
			.segregate(it => it.type === "dir");

		return {urlsDirs: dirs.map(({url}) => url), urlsFiles: files.map(({url}) => url)};
	}

	static _getImageDownloadUrl (downloadUrl) {
		// Map known GitHub URLs to the relative path in the Pages site
		// FIXME(Future) this should be configurable/based on the user's base site URL
		return downloadUrl.replace(
			/^https:\/\/raw\.githubusercontent\.com\/5etools-mirror-1\/5etools-mirror-1\.github\.io\/master\//,
			"https://5etools-mirror-1.github.io/",
		);
	}

	async _pDownloadLinks () {
		const linksFilesDownloadedSet = new Set(this._state.linksFilesDownloaded);
		const linksToDownload = MiscUtil.copy(this._state.linksFiles);

		const workers = [...new Array(8)]
			.map(async () => {
				while (linksToDownload.length) {
					const url = linksToDownload.pop();
					if (linksFilesDownloadedSet.has(url)) continue;

					await Vetools.pSaveImageToServerAndGetUrl({originalUrl: url, force: true});

					linksFilesDownloadedSet.add(url);
					this._state.linksFilesDownloaded.push(url);
					this._triggerCollectionUpdate("linksFilesDownloaded");

					if (!this._state.isRunningDownloads) break;
				}
			});

		await Promise.all(workers);

		if (this._state.isRunningDownloads) this._state.isRunningDownloads = false;
	}

	_getDefaultState () {
		return {
			ghToken: null,
			ghRepoUrl: "https://api.github.com/repos/5etools-mirror-1/5etools-mirror-1/contents/img?ref=master",
			linksFiles: [],
			linksFilesDownloaded: [],
			isRunningLinks: false,
			isRunningDownloads: false,
		};
	}
}

export {ImportSpecialImagePreloader};
