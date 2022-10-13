class UtilChat {
	static init () {
		if (game.user.isGM) this._init_gm();
	}

	static _init_gm () {
		$(document.body)
			.on("click", `[data-plut-chat-cancel]`, async evt => {
				await UtilChat.pDeleteMessage({ele: evt.currentTarget});
			});
	}

	static async pDeleteMessage ({ele}) {
		const msgId = $(ele)
			.closest(`[data-message-id]`)
			.attr("data-message-id");
		if (!msgId) return;

		const msg = CONFIG.ChatMessage.collection.instance.get(msgId);
		if (msg) await msg.delete();
	}

	static pSendGmOnlyMessage ({content}) {
		return ChatMessage.create({
			sound: "sounds/notify.wav",
			content: `<div class="secret-gm__block">${content}</div>
				<div class="secret-player__flex ve-muted italic help--hover ve-flex-vh-center" title="(GM-Only Message)">???</div>`,
			user: game.userId,
			type: 4,
			whisper: game.users.contents.filter(it => it.isGM).map(it => it.id),
		}).then(null);
	}
}

export {UtilChat};
