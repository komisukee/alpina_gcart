/**
 * G-KART LP
 * - スクロールフェードイン
 * - アコーディオン（デフォルト閉じ）
 * - ループスライダー（右から左へ無限ループ）
 * - 追従CTA
 */
(function () {
	'use strict';

	var root = document.querySelector('.gk');
	if (!root) return;

	var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ----------------------------------------------------------------------
	 * 1. スクロールフェードイン
	 * -------------------------------------------------------------------- */
	function initFadeIn() {
		var targets = root.querySelectorAll('[data-gk-fade]');
		if (!targets.length) return;

		if (reduceMotion || !('IntersectionObserver' in window)) {
			Array.prototype.forEach.call(targets, function (el) {
				el.classList.add('is-inview');
			});
			return;
		}

		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				entry.target.classList.add('is-inview');
				io.unobserve(entry.target);
			});
		}, {
			root: null,
			rootMargin: '0px 0px -12% 0px',
			threshold: 0.08
		});

		Array.prototype.forEach.call(targets, function (el) {
			io.observe(el);
		});
	}

	/* ----------------------------------------------------------------------
	 * 2. アコーディオン（デフォルトは閉じた状態）
	 *    連打しても状態がずれないよう、操作ごとに世代番号で transitionend を無効化する
	 * -------------------------------------------------------------------- */
	function initAccordion() {
		var buttons = root.querySelectorAll('.gk-acc__btn');

		Array.prototype.forEach.call(buttons, function (btn) {
			var panel = document.getElementById(btn.getAttribute('aria-controls'));
			if (!panel) return;

			// 初期状態：閉じる
			panel.hidden = false;
			setOpen(btn, panel, false, false);

			btn.addEventListener('click', function () {
				var isOpen = btn.getAttribute('aria-expanded') === 'true';
				setOpen(btn, panel, !isOpen, !reduceMotion);
			});

			// 開いた状態でのリサイズに追従
			window.addEventListener('resize', function () {
				if (btn.getAttribute('aria-expanded') !== 'true') return;
				panel.style.height = 'auto';
			});
		});

		function setOpen(btn, panel, open, animate) {
			var gen = (panel.gkGen || 0) + 1;
			panel.gkGen = gen;

			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
			panel.classList.toggle('is-open', open);

			if (!animate) {
				panel.style.height = open ? 'auto' : '0px';
				return;
			}

			// 現在の高さから目標の高さへ
			var from = panel.getBoundingClientRect().height;
			panel.style.height = from + 'px';
			void panel.offsetHeight;
			var to = open ? panel.scrollHeight : 0;

			// 高さが変わらない＝transitionend が発火しないので即座に確定させる
			if (from === to) {
				panel.style.height = open ? 'auto' : '0px';
				return;
			}

			panel.style.height = to + 'px';

			panel.addEventListener('transitionend', function onEnd(e) {
				if (e.propertyName !== 'height') return;
				panel.removeEventListener('transitionend', onEnd);
				// 途中で別の操作が入っていたら何もしない
				if (panel.gkGen !== gen) return;
				panel.style.height = open ? 'auto' : '0px';
			});
		}
	}

	/* ----------------------------------------------------------------------
	 * 3. ループスライダー（右から左へ無限ループ）
	 *    グループ全体を複製し、1グループ分ずらして繰り返すことで継ぎ目をなくす
	 *    ※ 共通テーマは #wrap を display:none で描画開始するため、
	 *       DOMContentLoaded 時点では幅が 0 になる。ResizeObserver で再構築する。
	 * -------------------------------------------------------------------- */
	function initMarquee() {
		var SPEED = 42; // px / sec
		var marquees = root.querySelectorAll('[data-gk-marquee]');

		Array.prototype.forEach.call(marquees, function (el) {
			var track = el.querySelector('.gk-marquee__track');
			if (!track) return;

			var origin = track.querySelector('.gk-marquee__group');
			if (!origin) return;

			var builtFor = 0;

			function build() {
				var viewWidth = el.getBoundingClientRect().width;
				if (!viewWidth) return;

				// 既存の複製を除去してから再構築
				var clones = track.querySelectorAll('.gk-marquee__group[data-clone]');
				Array.prototype.forEach.call(clones, function (n) { n.remove(); });
				el.classList.remove('is-ready');

				var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
				var groupWidth = origin.getBoundingClientRect().width;
				if (!groupWidth) return;

				var shift = groupWidth + gap;

				// 画面幅を埋めるまで複製し、さらに同数を複製して連結
				var setsNeeded = Math.max(1, Math.ceil(viewWidth / shift));
				var total = setsNeeded * 2;

				for (var i = 1; i < total; i++) {
					var clone = origin.cloneNode(true);
					clone.setAttribute('data-clone', '');
					clone.setAttribute('aria-hidden', 'true');
					Array.prototype.forEach.call(
						clone.querySelectorAll('a, button, input'),
						function (n) { n.setAttribute('tabindex', '-1'); }
					);
					track.appendChild(clone);
				}

				var period = shift * setsNeeded;
				el.style.setProperty('--shift', period + 'px');
				el.style.setProperty('--speed', (period / SPEED) + 's');
				el.classList.add('is-ready');
				builtFor = Math.round(viewWidth);
			}

			build();

			// 表示開始・リサイズ・画像読み込みで幅が確定したタイミングで再構築
			if ('ResizeObserver' in window) {
				var ro = new ResizeObserver(function (entries) {
					var w = Math.round(entries[0].contentRect.width);
					if (!w || w === builtFor) return;
					build();
				});
				ro.observe(el);
			} else {
				var timer = null;
				window.addEventListener('resize', function () {
					clearTimeout(timer);
					timer = setTimeout(build, 250);
				});
			}

			// フォールバック：読み込み完了後にもう一度
			window.addEventListener('load', function () {
				if (!el.classList.contains('is-ready')) build();
			});
		});
	}

	/* ----------------------------------------------------------------------
	 * 4. 共通ヘッダー（fixed）の高さを実測して FV のオフセットに反映
	 *    テーマ側の高さが変わっても FV が隠れないようにする
	 * -------------------------------------------------------------------- */
	function initHeaderOffset() {
		var header = document.querySelector('.gheader');
		if (!header) return;

		var apply = function () {
			var h = header.offsetHeight;
			if (h > 0) root.style.setProperty('--header-h', h + 'px');
		};

		apply();
		window.addEventListener('resize', apply);
		window.addEventListener('load', apply);

		if ('ResizeObserver' in window) {
			new ResizeObserver(apply).observe(header);
		}
	}

	/* ----------------------------------------------------------------------
	 * 5. フェード切替スライドショー（PCの「1日の過ごし方」右カラム）
	 * -------------------------------------------------------------------- */
	function initFadeShow() {
		var shows = root.querySelectorAll('[data-gk-fadeshow]');

		Array.prototype.forEach.call(shows, function (el) {
			var items = el.querySelectorAll('picture');
			if (items.length < 2) return;

			var i = 0;
			items[0].classList.add('is-active');

			setInterval(function () {
				// 非表示（SP）のときは進めない
				if (!el.offsetParent) return;
				items[i].classList.remove('is-active');
				i = (i + 1) % items.length;
				items[i].classList.add('is-active');
			}, 4000);
		});
	}

	/* ----------------------------------------------------------------------
	 * 6b. タブ切替（購入からの流れ）
	 * -------------------------------------------------------------------- */
	function initTabs() {
		var groups = root.querySelectorAll('[data-gk-tabs]');

		Array.prototype.forEach.call(groups, function (group) {
			var tabs = group.querySelectorAll('[role="tab"]');
			if (!tabs.length) return;

			function activate(tab) {
				Array.prototype.forEach.call(tabs, function (t) {
					var selected = t === tab;
					t.setAttribute('aria-selected', selected ? 'true' : 'false');
					t.classList.toggle('is-active', selected);
					t.tabIndex = selected ? 0 : -1;

					var panel = document.getElementById(t.getAttribute('aria-controls'));
					if (!panel) return;
					panel.hidden = !selected;
					panel.classList.toggle('is-active', selected);
				});
			}

			Array.prototype.forEach.call(tabs, function (tab, i) {
				tab.addEventListener('click', function () { activate(tab); });

				tab.addEventListener('keydown', function (e) {
					var idx = i;
					if (e.key === 'ArrowRight' || e.key === 'ArrowDown') idx = (i + 1) % tabs.length;
					else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') idx = (i - 1 + tabs.length) % tabs.length;
					else return;
					e.preventDefault();
					tabs[idx].focus();
					activate(tabs[idx]);
				});
			});
		});
	}

	/* ----------------------------------------------------------------------
	 * 6. 追従CTA（FVを通過したら表示）
	 * -------------------------------------------------------------------- */
	function initFloatingCta() {
		var floating = root.querySelector('[data-gk-floating]');
		var fv = root.querySelector('.gk-fv');
		if (!floating || !fv) return;

		var update = function () {
			var passed = fv.getBoundingClientRect().bottom < 0;
			floating.classList.toggle('is-shown', passed);
		};

		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
	}

	/* ----------------------------------------------------------------------
	 * init
	 * -------------------------------------------------------------------- */
	function init() {
		initHeaderOffset();
		initFadeIn();
		initAccordion();
		initMarquee();
		initFadeShow();
		initTabs();
		initFloatingCta();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
