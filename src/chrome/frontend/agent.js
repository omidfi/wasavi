// ==UserScript==
// @include http://*/*
// @include https://*/*
// @exclude http://wasavi.appsweets.net/
// @exclude http://wasavi.appsweets.net/?testmode
// @exclude https://ss1.xrea.com/wasavi.appsweets.net/
// ==/UserScript==
//
/**
 * wasavi: vi clone implemented in javascript
 * =============================================================================
 *
 *
 * @author akahuku@gmail.com
 */
/**
 * Copyright 2012-2015 akahuku, akahuku@gmail.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

typeof WasaviExtensionWrapper != 'undefined'
&& !WasaviExtensionWrapper.urlInfo.isExternal
&& (function (global) {

var EXTENSION_SPECIFIER = 'data-texteditor-extension';
var EXTENSION_CURRENT = 'data-texteditor-extension-current';
var MARKS_ID = 'data-wasavi-marks';
var FULLSCREEN_MARGIN = 8;
var MIN_WIDTH_PIXELS = 320;
var MIN_HEIGHT_PIXELS = 240;
var BOOT_WAIT_TIMEOUT_MSECS = 1000 * 5;
var ACCEPTABLE_TYPES = {
	textarea: 'enableTextArea',
	text:     'enableText',
	search:   'enableSearch',
	tel:      'enableTel',
	url:      'enableUrl',
	email:    'enableEmail',
	password: 'enablePassword',
	number:   'enableNumber'
};

var extension;
var isTestFrame;
var isOptionsPage;
var allowedElements;
var shortcutCode;
var fontFamily;
var quickActivation;
var devMode;
var logMode;
var canLaunch;
var statusLineHeight;

var targetElement;
var wasaviFrame;
var wasaviFrameInternalId;
var widthOwn;
var heightOwn;
var isFullscreen;
var isSyncSize;
var removeListener;
var resizeListener;
var wasaviFrameTimeoutTimer;
var getValueCallback;
var stateClearTimer;
var diagMessages;

function log () {
	logMode && console.log('wasavi agent: ' + Array.prototype.slice.call(arguments).join(' '));
}
function info () {
	logMode && console.info('wasavi agent: ' + Array.prototype.slice.call(arguments).join(' '));
}
function error () {
	logMode && console.error('wasavi agent: ' + Array.prototype.slice.call(arguments).join(' '));
}

function _ () {
	return Array.prototype.slice.call(arguments);
}

function getUniqueClass () {
	var result;
	do {
		result = 'wasavi_tmp_' + Math.floor(Math.random() * 0x10000);
	} while (document.getElementsByClassName(result).length > 0);
	return result;
}

function notifyToChild (id, payload) {
	if (!id) return;
	extension.postMessage({
		type: 'transfer',
		to: id,
		payload: payload
	});
}

function locate (iframe, target, opts) {
	function isFixedPosition (element) {
		var isFixed = false;
		for (var tmp = element; tmp && tmp != document.documentElement; tmp = tmp.parentNode) {
			var s = document.defaultView.getComputedStyle(tmp, '');
			if (s && s.position == 'fixed') {
				isFixed = true;
				break;
			}
		}
		return isFixed;
	}

	function assign () {
		for (var i = 0, goal = arguments.length; i < goal; i += 2) {
			var styleName = arguments[i];
			var value = arguments[i + 1];
			if (iframe.style[styleName] != value) {
				iframe.style[styleName] = value;
			}
		}
	}

	opts || (opts = {});
	var isFullscreen = !!opts.isFullscreen;

	if (isFullscreen) {
		var div = document.body.appendChild(document.createElement('div'));
		div.style.position = 'fixed';
		div.style.left = div.style.top =
		div.style.right = div.style.bottom = FULLSCREEN_MARGIN + 'px';
		var rect = div.getBoundingClientRect();
		div.parentNode.removeChild(div);

		assign(
			'position', 'fixed',
			'left', FULLSCREEN_MARGIN + 'px',
			'top', FULLSCREEN_MARGIN + 'px',
			'width', rect.width + 'px',
			'height', rect.height + 'px');

		return rect;
	}
	else {
		var rect = target.getBoundingClientRect();
		rect = {
			left:   rect.left,
			top:    rect.top,
			width:  Math.max(MIN_WIDTH_PIXELS, rect.width),
			height: Math.max(MIN_HEIGHT_PIXELS, rect.height + statusLineHeight)
		};
		rect.right = rect.left + rect.width;
		rect.bottom = rect.top + rect.height;

		var position = 'fixed';
		var centerLeft, centerTop, offsetLeft = 0, offsetTop = 0;

		if (!isFixedPosition(target)) {
			position = 'absolute';
			offsetLeft = Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
			offsetTop = Math.max(document.documentElement.scrollTop, document.body.scrollTop);
		}
		centerLeft = rect.left + offsetLeft + rect.width / 2;
		centerTop = rect.top + offsetTop + rect.height / 2;

		var result = {
			left: Math.max(0, Math.floor(centerLeft - rect.width / 2)),
			top: Math.max(0, Math.floor(centerTop - rect.height / 2)),
			width: rect.width,
			height: rect.height
		};

		var cover = document.body.appendChild(document.createElement('div'));
		cover.style.position = 'fixed';
		cover.style.left = cover.style.top =
		cover.style.right = cover.style.bottom = '0';
		var crect = cover.getBoundingClientRect();
		crect = {
			left:   crect.left   + offsetLeft,
			top:    crect.top    + offsetTop,
			right:  crect.right  + offsetLeft,
			bottom: crect.bottom + offsetTop,
			width:  crect.width,
			height: crect.height
		}

		if (result.width > crect.width) result.width = crect.width;
		if (result.height > crect.height) result.height = crect.height;

		if (result.left < crect.left) result.left = crect.left;
		if (result.top  < crect.top ) result.top  = crect.top;
		if (result.left + result.width > crect.right) result.left = crect.right - result.width;
		if (result.top + result.height > crect.bottom) result.top = crect.bottom - result.height;
		cover.parentNode.removeChild(cover);

		assign(
			'position', position,
			'left', result.left + 'px',
			'top', result.top + 'px',
			'width', result.width + 'px',
			'height', result.height + 'px');

		return result;
	}
}

function run (element) {
	fireCustomEvent('WasaviStarting', 0);

	diagMessages = ['agent: entering run()'];
	window.addEventListener('message', handlePostMessage, false);

	var isPseudoTextarea = false;
	for (var e = element; e; e = e.parentNode) {
		if (!e.classList) continue;
		if (e.classList.contains('CodeMirror')
		||  e.classList.contains('ace_editor')) {
			element = e;
			isPseudoTextarea = true;
			break;
		}
	}

	if (isPseudoTextarea) {
		if (getValueCallback) {
			runCore(element, extension.urlInfo.frameSource, '');
			return;
		}

		getValueCallback = function (value) {
			runCore(element, extension.urlInfo.frameSource, value);
		};

		var className = getUniqueClass();
		element.classList.add(className);
		setTimeout(function () {
			getValueCallback = null;
			element.classList.remove(className);
		}, BOOT_WAIT_TIMEOUT_MSECS);
		fireCustomEvent('WasaviRequestGetContent', {className:className});
	}
	else if (element.nodeName == 'INPUT' || element.nodeName == 'TEXTAREA') {
		runCore(element, extension.urlInfo.frameSource, element.value);
	}
	else if (element.isContentEditable) {
		runCore(element, extension.urlInfo.frameSource, toPlainText(element));
	}

	diagMessages.push('agent: leaving run()');
}

function runCore (element, frameSource, value) {
	diagMessages.push('agent: entering runCore()');

	/*
	 * boot sequence:
	 *
	 * background		agent		wasavi
	 *     |              |           |
	 *     |              |..........>|
	 *     |              |(create iframe)
	 *     |              |           |
	 *     |<.........................|
	 *     |(background recoginizes the iframe)
	 *     |              |           |
	 *     |<-------------|           |
	 *     |"push-payload"            |
	 *     |              |           |
	 *     |<-------------------------|
	 *     |           "init"         |
	 *     |              |           |
	 *     |------------------------->|
	 *     |       "init-response"    |
	 *     |              |           |
	 *     |              |<----------|
	 *     |              |"initialized"
	 *     |              |           |
	 *
	 */

	function getFontStyle (s, fontFamilyOverride) {
		return [
			s.fontStyle, s.fontVariant, s.fontWeight,
			s.fontSize + '/' + s.lineHeight,
			(fontFamilyOverride || s.fontFamily)
		].join(' ');
	}

	function getNodePath (element) {
		var result = [];
		for (var node = element; node && node.parentNode; node = node.parentNode) {
			var nodeName = node.nodeName.toLowerCase();
			var index = Array.prototype.indexOf.call(
				node.parentNode.getElementsByTagName(node.nodeName), node);
			result.unshift(nodeName + '[' + index + ']');
		}
		return result.join(' ');
	}

	//
	targetElement = element;
	targetElement.setAttribute(EXTENSION_CURRENT, extension.name);
	wasaviFrame = document.createElement('iframe');
	wasaviFrame.style.border = 'none';
	wasaviFrame.style.overflow = 'hidden';
	wasaviFrame.style.visibility = 'hidden';
	wasaviFrame.style.zIndex = 0x7fffffff;
	wasaviFrame.src = extension.urlInfo.frameSource || frameSource;

	document.body.appendChild(wasaviFrame);

	//
	widthOwn = heightOwn = null;
	isFullscreen = false;
	isSyncSize = true;
	removeListener = createElementRemoveListener(wasaviFrame, handleWasaviFrameRemove);
	wasaviFrameTimeoutTimer = setTimeout(handleWasaviFrameInitTimeout, BOOT_WAIT_TIMEOUT_MSECS);

	//
	var rect = locate(wasaviFrame, element);
	extension.postMessage({
		type:'push-payload',
		parentTabId:extension.tabId,
		parentInternalId:extension.internalId,
		url:window.location.href,
		title:document.title,
		testMode:isTestFrame,
		id:element.id,
		nodeName:element.nodeName,
		nodePath:getNodePath(element),
		isContentEditable:element.isContentEditable,
		elementType:element.type,
		selectionStart:element.selectionStart,
		selectionEnd:element.selectionEnd,
		scrollTop:element.scrollTop,
		scrollLeft:element.scrollLeft,
		readOnly:element.readOnly || element.disabled,
		value:value,
		rect:{width:rect.width, height:rect.height},
		fontStyle:getFontStyle(document.defaultView.getComputedStyle(element, ''), fontFamily),
		marks:element.getAttribute(MARKS_ID)
	});

	diagMessages.push('agent: leaving runCore()');
}

function cleanup (value, isImplicit) {
	if (targetElement) {
		if (value !== null) {
			setValue(targetElement, value);
		}
		!isImplicit && targetElement.focus();
		targetElement.removeAttribute(EXTENSION_CURRENT);
		targetElement = null;
	}
	if (removeListener) {
		removeListener = removeListener.disconnect();
	}
	if (wasaviFrame) {
		wasaviFrame.parentNode.removeChild(wasaviFrame);
		wasaviFrame = null;
	}
	if (stateClearTimer) {
		clearTimeout(stateClearTimer);
		stateClearTimer = null;
	}
	if (resizeListener) {
		resizeListener = resizeListener.disconnect();
	}
	window.removeEventListener('beforeunload', handleBeforeUnload, false);
	isFullscreen = isSyncSize = null;
	getValueCallback = null;
}

function focusToFrame (req) {
	if (!wasaviFrame) return;
	try {
		wasaviFrame.focus && wasaviFrame.focus();
	} catch (e) {}
	try {
		wasaviFrame.contentWindow
		&& wasaviFrame.contentWindow.focus
		&& wasaviFrame.contentWindow.focus();
	} catch (e) {}

	notifyToChild(wasaviFrameInternalId, {type:'focus-me-response'});
}

function blurFromFrame () {
	if (!wasaviFrame) return;
	try {
		wasaviFrame.contentWindow
		&& wasaviFrame.contentWindow.blur
		&& wasaviFrame.contentWindow.blur();
	} catch (e) {}
	try {
		wasaviFrame.blur && wasaviFrame.blur();
	} catch (e) {}
}

function getFocusables () {
	var ordered = [];
	var unordered = [];
	var nodes = document.evaluate([
		'//a[@href]',
		'//link[@href]',
		'//button[not(@disabled)]',
		'//input[not(@disabled)][@type!="hidden"]',
		'//select[not(@disabled)]',
		'//textarea[not(@disabled)]',
		'//command[not(disalbed)]',
		'//*[@tabIndex>=0]'
	].join('|'), document.body, null, window.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

	for (var i = 0, goal = nodes.snapshotLength; i < goal; i++) {
		var node = nodes.snapshotItem(i);
		var s = document.defaultView.getComputedStyle(node, '');
		if (s.visibility != 'visible') continue;
		if (node == wasaviFrame) continue;

		var ti = parseInt(node.getAttribute('tabIndex'));
		(!isNaN(ti) && ti > 0 ? ordered : unordered).push(node);
	}

	return ordered.concat(unordered);
}

function keylog () {
	var t = document.getElementById('test-log');
	if (!t) return;
	t.value += '\n' + Array.prototype.slice.call(arguments).join('\t');
	t.scrollTop = t.scrollHeight - t.clientHeight;
}

function fireCustomEvent (name, detail, target) {
	var ev = document.createEvent('CustomEvent');
	ev.initCustomEvent(name, false, false, detail);
	(target || document).dispatchEvent(ev);
}

function setValue (element, value, isForce) {
	value || (value = '');

	if (element.classList.contains('CodeMirror')) {
		if (typeof value != 'string') {
			return _('Invalid text format.');
		}
		var className = getUniqueClass();
		element.classList.add(className);
		setTimeout(function () {
			element.classList.remove(className);
		}, 1000 * 5);
		fireCustomEvent('WasaviRequestSetContent', {className:className, content:value});
		return value.length;
	}
	else if (element.nodeName == 'INPUT' || element.nodeName == 'TEXTAREA') {
		if (element.readOnly) {
			if (isForce) {
				element.readOnly = false;
			}
			else {
				return _('Element to be written has readonly attribute (use "!" to override).');
			}
		}
		if (element.disabled) {
			if (isForce) {
				element.disabled = false;
			}
			else {
				return _('Element to be written has disabled attribute (use "!" to override).');
			}
		}
		if (typeof value != 'string') {
			return _('Invalid text format.');
		}
		try {
			element.value = value;
			return value.length;
		}
		catch (e) {
			return _('Exception while saving: {0}', e.message);
		}
	}
	else {
		if (Object.prototype.toString.call(value) != '[object Array]') {
			return _('Invalid text format.');
		}

		var r = document.createRange();
		r.selectNodeContents(element);
		r.deleteContents();

		var f = document.createDocumentFragment();
		var length = 0;
		for (var i = 0, goal = value.length - 1; i < goal; i++) {
			f.appendChild(document.createTextNode(value[i]));
			f.appendChild(document.createElement('br'));
			length += value[i].length + 1;
		}
		if (value.length >= 1) {
			f.appendChild(document.createTextNode(value[value.length - 1]));
			length += value[i].length;
		}

		try {
			element.appendChild(f)
			return length;
		}
		catch (e) {
			return _('Exception while saving: {0}', e.message);
		}
	}
}

function toPlainText (input) {
	function hr2rule (node) {
		var nodes = node.getElementsByTagName('hr');
		var rule = '--------------------------------------------------------------------------------';
		while (nodes.length) {
			var newNode = document.createElement('div');
			nodes[0].parentNode.replaceChild(newNode, nodes[0]);
			newNode.textContent = rule;
		}
	}

	function getStyle (node, prop) {
		if (node.style[prop]) return node.style[prop];
		if (node.nodeName == 'SCRIPT') return 'none';
		var style = node.ownerDocument.defaultView.getComputedStyle(node, '');
		return style[prop];
	}

	function isBlock (display) {
		return 'table-row block list-item'.indexOf(display) >= 0;
	}

	function isForceInline (display) {
		return 'table-row'.indexOf(display) >= 0;
	}

	function newBlock (nodeName) {
		var text = '';
		if (t.length && !/\n$/.test(t[t.length - 1].text)) {
			text = '\n';
		}
		t.push({text:text, display:'', nodeName:nodeName || ''});
	}

	function loop (node) {
		var display = getStyle(node, 'display');
		if (display == 'none') {
			return '';
		}

		var block = isBlock(display);
		var forceInline = isForceInline(display);

		if (block) {
			newBlock(node.nodeName);
			t[t.length - 1].display = display;
			t[t.length - 1].whiteSpace = getStyle(node, 'whiteSpace');
		}

		var c, last = -1;
		for (var i = 0, goal = node.childNodes.length; i < goal; i++) {
			c = node.childNodes[i];
			if (c.nodeType == 3) {
				if (last >= 0 && last != t.length - 1) {
					newBlock();
					t[t.length - 1].display = getStyle(c.parentNode, 'display');
					t[t.length - 1].whiteSpace = getStyle(c.parentNode, 'whiteSpace');
					t[t.length - 1].nodeName = c.parentNode.nodeName;
				}
				var nodeValue = c.nodeValue.replace(/^\s+|\s+$/g, '');
				if (forceInline) {
					nodeValue = ' ' + nodeValue.replace(/\n/g, ' ');
				}
				last = t.length - 1;
				t[last].text += nodeValue;
			}
			else if (c.nodeName == 'BR') {
				if (!/\n$/.test(t[t.length - 1])) {
					t[t.length - 1].text += '\n';
				}
			}
			else if (c.childNodes.length) {
				loop(c);
			}
		}
		return t;
	}

	function normalize () {
		t.forEach(function (b, i) {
			if (/pre/.test(b.whiteSpace)) {
				b.text = b.text
					.replace(/^\s+|\s+$/g, '');
			}
			else {
				b.text = b.text
					.replace(/^[\t ]+|[\t ]+$/g, '')
					.replace(/[\t ]+/g, ' ');
			}
		});
	}

	function getResult () {
		var result = t
			.map(function (b) {return b.text})
			.join('')
			.replace(/^\s+|\s+$/g, '');
		return result;
	}

	var t = [];
	var inputTmp = input.cloneNode(true);
	input.parentNode.insertBefore(inputTmp, input.nextSibling);
	try {
		hr2rule(inputTmp);
		newBlock();
		loop(inputTmp);
		normalize();
		return getResult();
	}
	finally {
		inputTmp.parentNode.removeChild(inputTmp);
	}
}

function isInBlacklist (blacklist) {
	var result = (blacklist || '').split('\n').some(function (url) {
		url = url.replace(/^\s+|\s+$/g, '');
		if (url == '' || /^[#;]/.test(url)) return;

		try {
			url = new RegExp('^' + url
				.replace(/[\\^$+.()|{}]/g, function ($0) {return '\\' + $0})
				.replace(/\?/g, '.')
				.replace(/\*/g, '.+?'), 'i');

			if (url.test(window.location.href)) return true;
		}
		catch (e) {}
	});
	return result;
}

function matchWithShortcut (e) {
	return shortcutCode && shortcutCode.some(function (code) {
		for (var i in code) {
			if (!(i in e)) return false;
			if (e[i] !== code[i]) return false;
		}
		return true;
	});
}

function getMutationObserver () {
	return window.MutationObserver
	|| window.WebKitMutationObserver
	|| window.OMutationObserver
	|| window.MozMutationObserver;
}

function createElementRemoveListener (element, callback) {
	var mo = getMutationObserver();

	function fireRemoved () {
		callback({target: element});
	}

	function handleRemove (records) {
		element
		&& records.some(function (r) {
			return r.removedNodes && Array.prototype.indexOf.call(r.removedNodes, element) >= 0;
		})
		&& fireRemoved();
	}

	function connect () {
		mo ? mo.observe(element.parentNode, {childList: true}) :
			element.addEventListener('DOMNodeRemoved', fireRemoved, false);
	}

	function disconnect () {
		mo ? mo.disconnect() :
			element.removeEventListener('DOMNodeRemoved', fireRemoved, false);
	}

	mo = mo ? new mo(handleRemove) : null;
	connect();
	return {connect: connect, disconnect: disconnect};
}

function createElementResizeListener (element, callback) {
	var mo = getMutationObserver();
	var width = element.offsetWidth;
	var height = element.offsetHeight;
	var timer;

	function fireIfResized () {
		if (timer) return;
		timer = setTimeout(function () {
			timer = null;
			var resized = false;
			if (element.offsetWidth != width) {
				resized = true;
				width = element.offsetWidth;
			}
			if (element.offsetHeight != height) {
				resized = true;
				height = element.offsetHeight;
			}
			resized && callback({target: element});
		}, 100);
	}

	function handleDOMAttrModified (e) {
		e.attrName == 'style' && fireIfResized();
	}

	function connect () {
		mo ? mo.observe(element, {attributes: true, attributeFilter: ['style']}) :
			element.addEventListener('DOMAttrModified', handleDOMAttrModified, false);
		window.addEventListener('resize', fireIfResized, false);
		element.addEventListener('mouseup', fireIfResized, false);
	}

	function disconnect () {
		mo ? mo.disconnect() :
			element.removeEventListener('DOMAttrModified', handleDOMAttrModified, false);
		window.removeEventListener('resize', fireIfResized, false);
		element.removeEventListener('mouseup', fireIfResized, false);
	}

	mo = mo ? new mo(fireIfResized) : null;
	connect();
	return {connect: connect, disconnect: disconnect, fire: fireIfResized};
}

function connect () {
	var connected = false;
	var retryRest = 5;
	var wait = 1000;
	var eventName = isOptionsPage ? 'init-options' : 'init-agent';
	var gotInit = function (req) {
		if (connected) return;
		connected = true;
		handleConnect(req);
	};
	var timeout = function () {
		if (connected || retryRest <= 0) return;
		retryRest--;
		wait += 1000;
		setTimeout(timeout, wait);
		extension.connect(eventName, gotInit);
	}

	setTimeout(timeout, wait);
	extension.connect(eventName, gotInit);
}

/**
 * page agent creator
 * ----------------
 */

function createPageAgent (listenKeydown, hookKeyEvents) {
	var parent = document.head || document.body || document.documentElement;
	if (!parent) return;

	window.addEventListener('focus', handleTargetFocus, true);

	if (listenKeydown) {
		window.addEventListener('keydown', handleKeydown, true);
	}

	if (hookKeyEvents) {
		var s = document.createElement('script');
		s.onload = function () {
			this.onload = null;
			this.parentNode && this.parentNode.removeChild(this);
		};
		s.type = 'text/javascript';
		s.src = extension.getKeyHookScriptSrc();
		parent.appendChild(s);
	}
}

/**
 * keydown handler
 * ----------------
 */

function handleKeydown (e) {
	if (!canLaunch || targetElement || !e || !e.target || !allowedElements) return;
	if (e.keyCode == 16 || e.keyCode == 17 || e.keyCode == 18) return;

	if (e.target.isContentEditable && allowedElements.enableContentEditable
	||  (e.target.nodeName == 'TEXTAREA' || e.target.nodeName == 'INPUT')
		&& e.target.type in ACCEPTABLE_TYPES
		&& allowedElements[ACCEPTABLE_TYPES[e.target.type]]) {

		/*
		 * <textarea>
		 * <textarea data-texteditor-extension="auto">
		 *     one of extensions installed into browser is executed.
		 *
		 * <textarea data-texteditor-extension="none">
		 *     no extension is executed.
		 *
		 * <textarea data-texteditor-extension="wasavi">
		 *     wasavi extension is executed.
		 */

		var current = e.target.getAttribute(EXTENSION_CURRENT);
		var spec = e.target.getAttribute(EXTENSION_SPECIFIER);
		if (current !== null) return;
		if (spec !== null && spec !== 'auto' && spec !== extension.name) return;

		if (matchWithShortcut(e)) {
			e.preventDefault();
			e.stopPropagation();
			run(e.target);
		}
	}
}

/**
 * focus handler
 * ----------------
 */

function handleTargetFocus (e) {
	if (!canLaunch || !quickActivation || targetElement || !e || !e.target || !allowedElements) return;

	if (e.target.isContentEditable && allowedElements.enableContentEditable
	||  (e.target.nodeName == 'TEXTAREA' || e.target.nodeName == 'INPUT')
		&& e.target.type in ACCEPTABLE_TYPES
		&& allowedElements[ACCEPTABLE_TYPES[e.target.type]]) {

		var current = e.target.getAttribute(EXTENSION_CURRENT);
		var spec = e.target.getAttribute(EXTENSION_SPECIFIER);
		if (current !== null) return;
		if (spec !== null && spec !== 'auto' && spec !== extension.name) return;

		e.preventDefault();
		run(e.target);
	}
}

/**
 * resize handler for target element
 * ----------------
 */

function handleTargetResize (e) {
	if (!wasaviFrame || !targetElement) return;
	locate(wasaviFrame, targetElement, {
		isFullscreen: isFullscreen,
		width: widthOwn,
		height: heightOwn
	});
}

/**
 * element removal event handler
 * ----------------
 */

function handleWasaviFrameRemove () {
	wasaviFrame = null;
	cleanup();
	error('wasavi terminated abnormally.');
	if (diagMessages) {
		error(diagMessages.join('\n'));
		diagMessages = undefined;
	}
}
function handleWasaviFrameInitTimeout () {
	wasaviFrame.parentNode.removeChild(wasaviFrame);
	wasaviFrameTimeoutTimer = null;
}

/**
 * beforeunload handler
 * ----------------
 *
 */

function handleBeforeUnload (e) {
	if (targetElement && wasaviFrame) {
		return e.returnValue = 'wasavi: Unexpected closing. Are you sure?';
	}
}

/**
 * agent initializer
 * ----------------
 */

function handleAgentInitialized (req) {
	if (isOptionsPage) {
		window.WasaviOptions.extension = extension;
		window.WasaviOptions.initPage(req);
	}

	extension.isTopFrame()
	&& document.querySelector('textarea')
	&& info('running on ', window.location.href.replace(/[#?].*$/, ''));
}

/**
 * handler for launch request event
 * ----------------
 */

function handleRequestLaunch () {
	if (!canLaunch || wasaviFrame || targetElement || !allowedElements) return;
	if (typeof document.hasFocus == 'function' && !document.hasFocus()) return;

	var target = document.activeElement;
	if (target.isContentEditable && allowedElements.enableContentEditable
	||  (target.nodeName == 'TEXTAREA' || target.nodeName == 'INPUT')
		&& target.type in ACCEPTABLE_TYPES
		&& allowedElements[ACCEPTABLE_TYPES[target.type]]) {

		run(target);
	}
}

/**
 * handler for response from element content retriever
 * ----------------
 */

function handleResponseGetContent (e) {
	if (getValueCallback) {
		getValueCallback(e.detail);
		getValueCallback = null;
	}
}

/*
 * handler for messages comes from backend
 * ----------------
 */

function handleBackendMessage (req) {
	if (!req || !req.type) return;

	logMode && log('got a message from backend:', JSON.stringify(req).substring(0, 200));

	switch (req.type) {
	/*
	 * messages transferred from wasavi
	 */
	case 'initialized':
		if (!wasaviFrame) break;
		wasaviFrameInternalId = req.childInternalId;
		wasaviFrame.style.boxShadow = '0 3px 8px 4px rgba(0,0,0,0.5)';
		wasaviFrame.setAttribute('data-wasavi-state', 'running');
		resizeListener = createElementResizeListener(targetElement, handleTargetResize);
		window.addEventListener('beforeunload', handleBeforeUnload, false);

		if (isTestFrame) {
			wasaviFrame.id = 'wasavi_frame';
			document.getElementById('test-log').value = '';
		}

		notifyToChild(wasaviFrameInternalId, {type:'got-initialized'});
		break;

	case 'ready':
		if (!wasaviFrame) break;
		wasaviFrame.style.visibility = 'visible';
		document.activeElement != wasaviFrame && focusToFrame(req);
		info('wasavi started');
		fireCustomEvent('WasaviStarted', 0);

		clearTimeout(wasaviFrameTimeoutTimer);
		wasaviFrameTimeoutTimer = null;

		window.removeEventListener('message', handlePostMessage, false);
		diagMessages = undefined;
		break;

	case 'window-state':
		if (!wasaviFrame) break;
		switch (req.state) {
		case 'maximized':
		case 'normal':
			isFullscreen = req.state == 'maximized';
			locate(wasaviFrame, targetElement, {
				isFullscreen: isFullscreen
			});
			break;
		}
		break;

	case 'focus-me':
		if (!wasaviFrame) break;
		focusToFrame(req);
		break;

	case 'focus-changed':
		if (!wasaviFrame || !targetElement) break;
		var focusables = getFocusables();
		var index = focusables.indexOf(targetElement);
		try {
			if (index >= 0) {
				var next = req.direction == 1 ?
					(index + 1) % focusables.length :
					(index + focusables.length - 1) % focusables.length;

				blurFromFrame();

				if (next == targetElement) {
					document.body.focus();
				}
				else {
					focusables[next].focus();
				}
			}
			else {
				document.body.focus();
			}
		}
		catch (e) {}
		break;

	case 'blink-me':
		if (!wasaviFrame) break;
		wasaviFrame.style.visibility = 'hidden';
		wasaviFrame && setTimeout(function () {
			if (!wasaviFrame) return;
			wasaviFrame.style.visibility = '';
		}, 500);
		break;

	case 'set-size':
		if ('isSyncSize' in req) {
			isSyncSize = req.isSyncSize;
			if (isSyncSize) {
				widthOwn = heightOwn = null;
			}
			else {
				widthOwn = targetElement.offsetWidth;
				heightOwn = targetElement.offsetHeight;
			}
		}
		if ('width' in req) {
			if (isSyncSize) {
				targetElement.style.width = req.width + 'px';
				widthOwn = null;
			}
			else {
				widthOwn = req.width;
			}
		}
		if ('height' in req) {
			if (isSyncSize) {
				targetElement.style.height = req.height + 'px';
				heightOwn = null;
			}
			else {
				heightOwn = req.height;
			}
		}
		resizeListener.fire();
		break;

	case 'terminated':
		if (!wasaviFrame) break;
		if (isTestFrame) {
			if (stateClearTimer) {
				clearTimeout(stateClearTimer);
				stateClearTimer = null;
			}
			document.querySelector('h1').style.color = '';
		}
		if (req.marks) {
			targetElement.setAttribute(MARKS_ID, req.marks);
		}
		cleanup(req.value, req.isImplicit);
		info('wasavi terminated');
		fireCustomEvent('WasaviTerminated', 0);
		break;

	case 'read':
		if (!wasaviFrame) break;
		notifyToChild(wasaviFrameInternalId, {
			type:'read-response',
			state:'complete',
			meta:{
				path:'',
				bytes:targetElement.value.length
			},
			content:targetElement.value
		});
		break;

	case 'write':
		if (!wasaviFrame) break;
		var result = setValue(targetElement, req.value, req.isForce);
		var payload = {type:'write-response'};
		if (typeof result == 'number') {
			payload.state = 'complete';
			payload.meta = {
				path:req.path,
				bytes:result
			};
		}
		else if (Object.prototype.toString.call(value) == '[object Array]') {
			payload.error = result;
		}
		else {
			payload.error = _('Internal state error.');
		}

		notifyToChild(wasaviFrameInternalId, payload);
		break;

	/*
	 * messages from backend
	 */
	case 'update-storage':
		var logbuf = [];
		var qaBlacklist;
		for (var i in req.items) {
			var item = req.items[i];
			switch (item.key) {
			case 'targets':
				allowedElements = item.value;
				logbuf.push(item.key);
				break;

			case 'shortcutCode':
				shortcutCode = item.value;
				logbuf.push(item.key);
				break;

			case 'quickActivation':
				quickActivation = item.value;
				logbuf.push(item.key);
				break;

			case 'logMode':
				logMode = item.value;
				logbuf.push(item.key);
				break;

			case 'qaBlacklist':
				qaBlacklist = item.value;
				logbuf.push(item.key);
				break;
			}
		}
		if (qaBlacklist) {
			canLaunch = !isInBlacklist(qaBlacklist);
		}
		logbuf.length && log(
			'update-storage: consumed ', logbuf.join(', '));
		break;

	case 'request-run':
		handleRequestLaunch();
		break;

	case 'ping':
		break;

	/*
	 * following cases are for functionality test.
	 * available only on http://wasavi.appsweets.net/test_frame.html
	 */
	case 'notify-keydown':
		if (!isTestFrame) break;
		if (stateClearTimer) {
			clearTimeout(stateClearTimer);
			stateClearTimer = null;
		}
		if (wasaviFrame.getAttribute('data-wasavi-command-state') != 'busy') {
			wasaviFrame.setAttribute('data-wasavi-command-state', 'busy');
			document.querySelector('h1').style.color = 'red';
			keylog('', '', 'command start');
		}
		keylog.apply(null, ['key', 'keyCode', 'eventType'].map(function (a) {
			return (a in req) ? req[a] : '';
		}));
		break;

	case 'notify-error':
		if (!isTestFrame) break;
		keylog(
			'error on ' + document.querySelector('h1').textContent,
			req.fileName + '(' + req.lineNumber + ')',
			req.message);
		break;

	case 'notify-state':
		if (!isTestFrame) break;
		if (stateClearTimer) {
			clearTimeout(stateClearTimer);
		}
		stateClearTimer = setTimeout(function () {
			stateClearTimer = null;

			wasaviFrame.setAttribute('data-wasavi-state', JSON.stringify(req.state));
			wasaviFrame.setAttribute('data-wasavi-input-mode', req.state.inputMode);
			wasaviFrame.removeAttribute('data-wasavi-command-state');

			keylog('notify-state');
		}, 500);
		break;

	case 'command-completed':
		if (!isTestFrame) break;
		if (stateClearTimer) {
			clearTimeout(stateClearTimer);
		}
		stateClearTimer = setTimeout(function () {
			stateClearTimer = null;
			try {
				wasaviFrame.setAttribute('data-wasavi-state', JSON.stringify(req.state));
				wasaviFrame.setAttribute('data-wasavi-input-mode', req.state.inputMode);
				wasaviFrame.setAttribute('data-wasavi-line-input', req.state.lineInput);

				document.querySelector('h1').style.color = '';

				var state = document.getElementById('state');
				state.textContent = '';
				['running', 'state', 'inputMode', 'row', 'col', 'lastMessage'].forEach(function (p) {
					state.appendChild(document.createElement('div')).textContent =
						p + ': ' + req.state[p];
				});
			}
			finally {
				wasaviFrame.removeAttribute('data-wasavi-command-state');
				keylog('*** sequence point (' + req.state.inputMode + ') ***');

			}
		}, 500);
		break;
	}
}

/*
 * handler for cross messaging, for debug
 * ----------------
 */

function handlePostMessage (e) {
	if (window.chrome) {
		if (e.origin != 'chrome-extension://' + chrome.runtime.id) return;
	}
	else if (window.opera) {
		if (e.origin != 'http://wasavi.appsweets.net'
		&&  e.origin != 'https://ss1.xrea.com') return;
	}
	else if (WasaviExtensionWrapper.IS_GECKO) {
		// on Firefox, e.origin is always null. maybe a bug?
	}
	diagMessages.push('wasavi: ' + e.data);
}

/*
 * handler for connection to extension
 * ----------------
 */

function handleConnect (req) {
	if (!req || !('tabId' in req) || !req.tabId) {
		if (logMode) {
			var missing = '?';
			if (!req) {
				missing = 'empty req object';
			}
			else if (!('tabId' in req)) {
				missing = 'missing req.tabId';
			}
			error(
				'wasavi agent: got init-response message',
				' (' + missing + ').');
		}
		return;
	}

	extension.tabId = req.tabId;
	allowedElements = req.targets;
	shortcutCode = req.shortcutCode;
	fontFamily = req.fontFamily;
	quickActivation = req.quickActivation;
	devMode = req.devMode;
	logMode = req.logMode;
	canLaunch = !isInBlacklist(req.qaBlacklist);
	statusLineHeight = req.statusLineHeight;

	extension.ensureRun(handleAgentInitialized, req);
}

/**
 * bootstrap
 * ----------------
 */

extension = WasaviExtensionWrapper.create();
isTestFrame = window.location.href.indexOf('http://wasavi.appsweets.net/test_frame.html') == 0;
isOptionsPage = window.location.href == extension.urlInfo.optionsUrl;

createPageAgent(true, false);
extension.setMessageListener(handleBackendMessage);
document.addEventListener('WasaviRequestLaunch', handleRequestLaunch, false);
document.addEventListener('WasaviResponseGetContent', handleResponseGetContent, false);

connect();

})(this);

// vim:set ts=4 sw=4 fileencoding=UTF-8 fileformat=unix filetype=javascript fdm=marker :
