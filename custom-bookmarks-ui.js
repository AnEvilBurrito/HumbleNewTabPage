'use strict';
// UI glue for Humble's existing renderer. All persistent mutations use the provider.
var yamlEditor = document.getElementById('bookmark_yaml');
var editorBaseRaw;
var editorBaseSource;
var previewSource = null;
var fileReadGeneration = 0;
var editingBookmarkId = null;
var formBaseRaw;
var formReturnFocus;

function setBookmarkStatus(message, error) {
	var status = document.getElementById('bookmark_status');
	status.textContent = message;
	status.classList.toggle('error-message', Boolean(error));
}
function bookmarkEditorDirty() {
	return yamlEditor.value !== editorBaseSource;
}
function reloadBookmarkEditor() {
	editorBaseRaw = bookmarkStore.raw();
	// Even a corrupt record remains available for recovery rather than being erased.
	var source = bookmarks.source;
	if (bookmarkError && editorBaseRaw) {
		try { source = JSON.parse(editorBaseRaw).source || editorBaseRaw; }
		catch (error) { source = editorBaseRaw; }
	}
	yamlEditor.value = source;
	editorBaseSource = source;
	previewSource = null;
	document.getElementById('bookmark_apply').disabled = true;
	setBookmarkStatus(bookmarkError || bookmarks.categories.length + ' categories, ' + bookmarks.count + ' bookmarks saved locally.', Boolean(bookmarkError));
}
function refreshBookmarkControls() {
	var placeholder = document.getElementById('options_show_categories');
	placeholder.replaceChildren();
	bookmarks.categories.forEach(function(node) {
		var key = 'show_' + node.id;
		var label = document.createElement('label');
		var span = document.createElement('span');
		span.textContent = node.title;
		var input = document.createElement('input');
		input.type = 'checkbox';
		input.id = 'options_' + key;
		label.htmlFor = input.id;
		label.append(span, input);
		placeholder.appendChild(label);
		if (settingsInitialized) initConfig(key);
	});
}
function openBookmarkOptions() {
	showOptions(true);
	document.querySelectorAll('#options_nav a')[2].click();
	yamlEditor.focus();
}
function refreshAfterBookmarkChange() {
	loadBookmarkData();
	loadColumns();
	if (!bookmarkError) {
		var layout = JSON.stringify(columns);
		try {
			if (localStorage.getItem(CustomBookmarks.LAYOUT_KEY) !== layout)
				localStorage.setItem(CustomBookmarks.LAYOUT_KEY, layout);
		} catch (error) { alert('Bookmarks loaded, but layout could not be saved: ' + error.message); }
	}
	if (settingsInitialized) refreshBookmarkControls();
	if (document.getElementById('options_export')) {
		document.getElementById('options_export').value = JSON.stringify(localStorage);
	}
}
function previewBookmarks() {
	try {
		var parsed = CustomBookmarks.parse(yamlEditor.value);
		previewSource = yamlEditor.value;
		document.getElementById('bookmark_apply').disabled = false;
		var warnings = parsed.warnings.slice(0, 20);
		var extra = parsed.warnings.length > warnings.length ? '\n… and ' + (parsed.warnings.length - warnings.length) + ' more warnings.' : '';
		setBookmarkStatus('Preview: ' + parsed.categories.length + ' categories, ' + parsed.count +
			' bookmarks. Apply replaces the saved list.' + (warnings.length ? '\n' + warnings.join('\n') + extra : ''));
	} catch (error) {
		previewSource = null;
		document.getElementById('bookmark_apply').disabled = true;
		setBookmarkStatus(error.message, true);
	}
}
function downloadText(text, filename, type) {
	var url = URL.createObjectURL(new Blob([text], { type: type }));
	var anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function updateCategoryInput() {
	var creating = document.getElementById('bookmark_category').value === '';
	document.getElementById('new_category_label').hidden = !creating;
	var input = document.getElementById('bookmark_new_category');
	input.hidden = !creating;
	input.required = creating;
}
function updateIconPreview() {
	var value = document.getElementById('bookmark_icon').value;
	document.getElementById('bookmark_icon_preview').textContent = CustomBookmarks.glyph(value);
	// Limit autocomplete DOM size while allowing all 7,000+ icon names.
	var names = CustomBookmarks.iconNames.filter(function(name) {
		return name.includes(CustomBookmarks.normalizeIcon(value));
	}).slice(0, 80);
	var list = document.getElementById('mdi_names');
	list.replaceChildren();
	names.forEach(function(name) {
		var option = document.createElement('option');
		option.value = name;
		list.appendChild(option);
	});
}
function showBookmarkForm(node, categoryId) {
	if (bookmarkError) { openBookmarkOptions(); return; }
	if (bookmarkEditorDirty()) {
		alert('Apply or reload your unsaved YAML edits before using quick add/edit.');
		openBookmarkOptions();
		return;
	}
	// Re-read before editing, then reject stale forms on Save.
	refreshAfterBookmarkChange();
	formBaseRaw = bookmarkStore.raw();
	editingBookmarkId = node ? node.id : null;
	var current = node && bookmarks.nodes.get(node.id);
	if (node && !current) { alert('This bookmark no longer exists.'); return; }
	formReturnFocus = document.activeElement.closest('#options') ? document.getElementById('options_button') : document.activeElement;
	showOptions(false);
	document.getElementById('bookmark_form').reset();
	document.getElementById('bookmark_dialog_title').textContent = node ? 'Edit bookmark' : 'Add bookmark';
	document.getElementById('bookmark_url').value = current ? current.url : '';
	document.getElementById('bookmark_name').value = current ? current.title : '';
	document.getElementById('bookmark_icon').value = current ? current.mdiIcon : '';
	var select = document.getElementById('bookmark_category');
	select.replaceChildren();
	bookmarks.categories.forEach(function(category) {
		var option = document.createElement('option');
		option.value = category.id;
		option.textContent = category.title;
		select.appendChild(option);
	});
	var create = document.createElement('option');
	create.value = '';
	create.textContent = '+ Create category';
	select.appendChild(create);
	select.value = current ? current.categoryId : categoryId || (bookmarks.categories[0] ? bookmarks.categories[0].id : '');
	updateCategoryInput();
	updateIconPreview();
	document.getElementById('bookmark_form_status').textContent = '';
	document.getElementById('bookmark_dialog').showModal();
	document.getElementById('bookmark_url').focus();
}
function deleteBookmark(node) {
	if (bookmarkEditorDirty()) { alert('Apply or reload your unsaved YAML edits first.'); openBookmarkOptions(); return; }
	if (!confirm('Delete “' + node.title + '” from your custom list?')) return;
	try {
		bookmarkStore.remove(node.id, editorBaseRaw);
		refreshAfterBookmarkChange();
		reloadBookmarkEditor();
	} catch (error) { alert(error.message); }
}

// File input only changes the editor, never the saved list.
document.getElementById('bookmark_file').onchange = async function() {
	var file = this.files[0];
	var generation = ++fileReadGeneration;
	if (!file) return;
	if (file.size > CustomBookmarks.MAX_BYTES) { setBookmarkStatus('YAML must be at most 1 MiB.', true); this.value = ''; return; }
	if (bookmarkEditorDirty() && !confirm('Replace your unsaved YAML editor text with this file?')) { this.value = ''; return; }
	try {
		var text = await file.text();
		if (generation !== fileReadGeneration) return;
		yamlEditor.value = text;
		previewBookmarks();
	} catch (error) { setBookmarkStatus('Unable to read file: ' + error.message, true); }
	this.value = '';
};
yamlEditor.oninput = function() {
	fileReadGeneration++;
	previewSource = null;
	document.getElementById('bookmark_apply').disabled = true;
	setBookmarkStatus(bookmarkEditorDirty() ? 'Unsaved changes. Validate before applying.' : 'No unsaved changes.');
};
document.getElementById('bookmark_validate').onclick = previewBookmarks;
document.getElementById('bookmark_apply').onclick = function() {
	if (previewSource === null || previewSource !== yamlEditor.value) { previewBookmarks(); return; }
	if (!confirm('Replace your saved custom bookmarks with this YAML list?')) return;
	try {
		bookmarkStore.save(previewSource, editorBaseRaw);
		refreshAfterBookmarkChange();
		reloadBookmarkEditor();
	} catch (error) { setBookmarkStatus(error.message, true); }
};
document.getElementById('bookmark_reload').onclick = function() {
	if (bookmarkEditorDirty() && !confirm('Discard unsaved edits and reload the saved list?')) return;
	fileReadGeneration++;
	refreshAfterBookmarkChange();
	reloadBookmarkEditor();
};
document.getElementById('bookmark_export').onclick = function() {
	try {
		if (bookmarkError) {
			downloadText(bookmarkStore.raw() || '', 'bookmarks-recovery.json', 'application/json');
		} else {
			downloadText(bookmarkStore.load().source, 'bookmarks.yaml', 'application/yaml');
		}
	} catch (error) { setBookmarkStatus(error.message, true); }
};
document.getElementById('bookmark_clear').onclick = function() {
	if (!confirm('Clear the saved custom list and any unsaved editor text? Export a backup first.')) return;
	try {
		bookmarkStore.save(CustomBookmarks.EMPTY_YAML, editorBaseRaw);
		fileReadGeneration++;
		refreshAfterBookmarkChange();
		reloadBookmarkEditor();
	} catch (error) { setBookmarkStatus(error.message, true); }
};
document.getElementById('add_bookmark').onclick = function() { showBookmarkForm(); };
document.getElementById('import_bookmarks').onclick = openBookmarkOptions;
document.getElementById('bookmark_category').onchange = updateCategoryInput;
document.getElementById('bookmark_icon').oninput = updateIconPreview;
document.getElementById('bookmark_cancel').onclick = function() { document.getElementById('bookmark_dialog').close(); };
document.getElementById('bookmark_dialog').onclose = function() {
	if (formReturnFocus && formReturnFocus.isConnected) formReturnFocus.focus();
};
document.getElementById('bookmark_form').onsubmit = function(event) {
	event.preventDefault();
	try {
		var category = bookmarks.nodes.get(document.getElementById('bookmark_category').value);
		var next = bookmarkStore.upsert({
			category: category ? category.title : document.getElementById('bookmark_new_category').value,
			name: document.getElementById('bookmark_name').value,
			url: document.getElementById('bookmark_url').value,
			icon: document.getElementById('bookmark_icon').value
		}, editingBookmarkId, formBaseRaw);
		refreshAfterBookmarkChange();
		reloadBookmarkEditor();
		document.getElementById('bookmark_dialog').close();
		if (next.warnings.length) {
			setBookmarkStatus('Saved. ' + next.warnings.slice(0, 20).join('\n'));
			openBookmarkOptions();
		}
	} catch (error) { document.getElementById('bookmark_form_status').textContent = error.message; }
};

window.addEventListener('storage', function(event) {
	if (event.storageArea !== localStorage) return;
	var dirty = bookmarkEditorDirty();
	if (event.key === CustomBookmarks.DATA_KEY || event.key === null) {
		refreshAfterBookmarkChange();
		if (dirty) {
			previewSource = null;
			document.getElementById('bookmark_apply').disabled = true;
			setBookmarkStatus('Saved bookmarks changed in another tab. Your unsaved text is preserved. Reload saved before applying.', true);
		} else reloadBookmarkEditor();
	} else if (event.key === CustomBookmarks.LAYOUT_KEY || event.key.startsWith(CustomBookmarks.OPEN_PREFIX) || event.key.startsWith('options.')) {
		loadSettings();
		loadColumns();
		if (settingsInitialized) for (var key in config) showConfig(key);
	}
});
reloadBookmarkEditor();
if (location.search === '?options') showOptions(true);
