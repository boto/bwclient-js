/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.data_table
 */

(function ($) {

var sort_regex = new RegExp('\\s*<[^>]*>\\s*|[^\\w\\s\\d]+|\\b(the|a|an)\\s+', 'g');

/**
 * Generates a search form.
 *
 * @param node the node containing the search parameters.
 */
botoweb.ui.widget.DataTable = function(table, opt) {
	opt = opt || {};
	var sorting = [];
	var paginate = true;

	table.find('th').each(function (col_idx) {
		if (/\bsort-(asc|desc)\b/.test(this.className)) {
			sorting = [[col_idx, RegExp.$1]];
			return false;
		}
	});

	var dt_template = 't' // the table
		+ '<"fg-toolbar ui-widget-header ui-corner-bottom ui-helper-clearfix"'
		+ 'i' // showing 1 to 10 of 250 results text
		+ 'p' // paging links
		+ '>';

	if (!table.hasClass('hide_tools')) {
		dt_template = '<"fg-toolbar ui-widget-header ui-corner-top ui-helper-clearfix"'
			+ 'f' // quick filtering
			+ 'l' // per page limiting
			+ 'T' // TableTools plugin
			+ '<"clear">p' // paging links
			+ '>' + dt_template;
	}

	if (table.hasClass('no_paging'))
		paginate = false;

	this.data_table = table.dataTable({
		bJQueryUI: true,
		oLanguage: {
			sSearch: 'Filter results: ',
			sLengthMenu: "Show _MENU_ per page",
			sInfo: 'Showing _START_ to _END_ of _TOTAL_ results'
		},
		aaSorting: sorting,
		sDom: dt_template,
		bPaginate: paginate,
		sPaginationType: 'full_numbers',
		"bAutoWidth": false
	});

	var self = this;
	table.data('data_table', self);

	this.opt = opt || {};
	this.pending = [];
	this.paused = false;

	var settings = this.data_table.fnSettings();
	if (!settings) return;
	$(settings.aoColumns).each(function(col_idx) {
		// Sort on raw value, not HTML markup
		this.bUseRendered = true;
		var col_class = false;
		this.sType = 'string';

		// Expose dataTables functionality through classNames on the TH element
		//if (/\bno-sort\b/.test(this.nTh.className))
		//	this.bSortable = false;
		if (/\bno-search\b/.test(this.nTh.className))
			this.bSearchable = false;
		if (/\bhidden\b/.test(this.nTh.className))
			this.bVisible = false;
		if (/\bhidden\b/.test(this.nTh.className))
			this.bVisible = false;
		if (/\b(col-\S+)\b/.test(this.nTh.className)) {
			col_class = true;
			this.sClass = RegExp.$1;
		}

		if ($(this.nTh).attr(botoweb.ui.markup.prop.editable) == 'false') {
			this.sClass += ' no-edit';
		}

		// For some reason the bSortable option is not handled very well by
		// dataTables, so this removes the sort functionality from the UI
		if (/\bno-sort\b/.test(this.nTh.className)) {
			$(this.nTh)
				.unbind()
				.css('cursor', 'default')
				.find('span').remove()
		}

		// Works opposite of how a rendering function should, but this is required
		// to function without modifying dataTables. Returns the original HTML after
		// setting the column's value to its text-only form.
		this.fnRender = function(t) {
			var html = t.aData[t.iDataColumn];
			var text = html.replace(/<[^>]*>/g, '');
			t.oSettings.aoData[t.iDataRow]._aData[t.iDataColumn] = text;
			if (col_class)
				t.nTd.className = 'cell-' + text.replace(/\s.*/, '');
			return html;
		}
	});

	/*this.data_table.parent().find('.fg-toolbar.ui-corner-bl').append(
		$('<div/>')
			.addClass('selection-buttons')
			.append(
				$('<span/>')
					.addClass('fg-button ui-corner-tl ui-corner-bl ui-state-default')
					.text('Select All')
					.click(function() {
						table.find('tr').addClass('row_selected');
					}),
				$('<span/>')
					.addClass('fg-button ui-corner-tr ui-corner-br ui-state-default')
					.text('Deselect All')
					.click(function() {
						table.find('tr').removeClass('row_selected');
					})
			)
	);*/

	this.status = $('<div/>')
		.addClass('selection-buttons');

	this.data_table.parent().find('.fg-toolbar.ui-corner-bl').append(
		this.status
	);

	this.update_progress = function(percent, text) {
		if (!this.progressbar) {
			this.progressbar = $('<div/>')
				.addClass('data_progress')
				.appendTo(this.status);
			this.progress_text = $('<div/>')
				.appendTo(this.status);

			this.progressbar.progressbar({ value: percent });
		}

		if (!this.button_stop && this.opt.search_results) {
			var self = this;

			this.progressbar.add(this.progressbar.children()).removeClass('ui-corner-all ui-corner-left')
				.addClass('ui-corner-tr ui-corner-br');

			this.button_stop = botoweb.ui.button('', { icon: 'ui-icon-pause', corners: [1,0,0,1] })
				.addClass('pause_search')
				.click(function () {
					self.toggle_pause();
				})
				.prependTo(this.progressbar);
		}

		this.progressbar.progressbar('option', 'value', percent);
		this.progress_text.text(text);

		if (percent >= 100)
			this.stop();
	}

	this.stop = function(pause_button) {
		if (self.pending.length) {
			this.data_table.fnAddData(self.pending, false);
			self.pending = [];
		}

		if (this.button_stop && !pause_button) {
			this.button_stop = null;
			this.status.empty();
			this.update_totals();
		}

		this.paused = pause_button;

		this.data_table.fnDraw();
	}

	/**
	 * Updates the cells in the tfoot of a dataTable which have a bwFormula
	 * specified based on the data in the table.
	 */
	this.update_totals = function () {
		var tfoot = $(table).find('tfoot');

		if (tfoot.length == 0)
			return;

		function sanitize_cell(value) {
			return parseFloat(value.replace(/<.*?>|,|\$/g, ''));
		}

		tfoot.find('td, th').each(function (i, col) {
			col = $(col);
			var formula = col.attr(botoweb.ui.markup.prop.formula);

			if (!formula)
				return;

			formula = formula.replace(/\((.*?)\)/, '');
			var params = RegExp.$1;

			var data = self.data_table.fnGetData();
			var fnc;
			var value;

			switch (formula) {
				case 'sum':
					value = 0;
					$.each(data, function () {
						value += sanitize_cell(this[i]);
					});
					break;

				case 'mean':
					value = 0;
					$.each(data, function () {
						value += sanitize_cell(this[i]);
					});
					value /= data.length;
					break;

				case 'max':
					value = -1e99;
					$.each(data, function () {
						var v = sanitize_cell(this[i]);

						if (v > value)
							value = v;
					});
					break;

				case 'min':
					value = 1e99;
					$.each(data, function () {
						var v = sanitize_cell(this[i]);

						if (v < value)
							value = v;
					});
					break;

				default:
					return;
			}

			botoweb.ui.markup.set_html(col, value);
		});
	}

	this.toggle_pause = function () {
		this.button_stop.find('span')
			.toggleClass('ui-icon-play ui-icon-pause');

		// Just toggled, so the button was originally pause
		if (this.button_stop.find('span.ui-icon-play').length) {
			this.stop(true);
			this.opt.search_results.stop();
		}
		else {
			this.resume();
			this.opt.search_results.resume();
		}
	}

	this.resume = function () {
		this.paused = false;
	}

	this.add_events = function() {
		return;
		table.find('tr')
			.addClass('selectable')
			.mousedown(function(e) {
				if (e.shiftKey) {
					if (botoweb.ui.last_row) {
						var rows = $(this).parent().children();
						var i1 = rows.index($(this));
						var i2 = rows.index(botoweb.ui.last_row);

						rows.slice(Math.min(i1, i2), Math.max(i1, i2) + 1).each(function() {
							if (e.ctrlKey)
								$(this).removeClass('row_selected');
							else
								$(this).addClass('row_selected');
						});
					}
					e.preventDefault();
				}
				else if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
				}
				else {
					$(this).siblings('tr').removeClass('row_selected');
				}

				botoweb.ui.last_row = this;

				if (e.shiftKey)
					return;

				if ($(this).hasClass('row_selected'))
					$(this).removeClass('row_selected');
				else
					$(this).addClass('row_selected');
			});
	}

	this.append = function(row, obj) {
		// Converts each row to an HTML string which includes an HTML comment for
		// easy data sorting.
		function stringify (node) {
			return $(node).find('> td').map(function() {
				if (this.innerHTML.indexOf('<!-- DATA ') < 0)
					return self.sort_string(this.innerHTML) + this.innerHTML.replace('\n',' ');

				return this.innerHTML.replace('\n',' ');
			});
		}

		var item = stringify(row);

		// If the row has a valid trigger on it, call the trigger when the row
		// is ready. The trigger may modify the row in-place or create a new TR.
		// We do not add this row to the pending queue because we need a dataTable
		// row id for it immediately in order to allow it to be updated.
		// The trigger may modify the row in-place and call the update function
		// in the third argument to update the displayed data.
		var trigger = row.attr(botoweb.ui.markup.prop.trigger);
		if (trigger && trigger in botoweb.env.cfg.triggers) {
			var row_id = this.data_table.fnAddData(item)[0];

			botoweb.env.cfg.triggers[trigger](obj, row, { update: function (new_node) {
				var item = stringify(new_node || row);
				self.data_table.fnUpdate(item, row_id);
			}});
			return;
		}

		if (item.length == settings.aoColumns.length)
			this.pending.push(item);

		if (this.pending.length < 50)
			return;

		this.data_table.fnAddData(this.pending, false);

		this.pending = [];
	}

	this.sort_string = function (str) {
		return '<!-- DATA ' + str.toLowerCase().replace(sort_regex, '') + ' -->';
	}

	this.update = function(row, values) {
		var settings = this.data_table.fnSettings();

		var item = [];
		$(values).each(function() {
			$(this).find('td').each(function() {
				item.push($(this).html().replace(/^\s*|\s*$/g, ''));
			});
		});

		if (item.length == settings.aoColumns.length)
			this.data_table.fnUpdate(item, row, null, !this.opt.no_redraw);
	}

	this.del = function(row) {
		this.data_table.fnDeleteRow(row);
	}

	this.reset = function() {
		if (this.progressbar) {
			this.status.empty()
			this.progressbar = null;
			this.pending = [];
		}
		this.data_table.fnClearTable();
	}
};

/**
 * Sorts strings in the most minimal way possible (assuming they are already
 * indexed)
 */
$.fn.dataTableExt.oSort['string-asc']  = function(x,y) {
	return ((x < y) ? -1 : ((x > y) ?  1 : 0));
};

/**
 * Sorts strings in the most minimal way possible (assuming they are already
 * indexed)
 */
$.fn.dataTableExt.oSort['string-desc'] = function(x,y) {
	return ((x < y) ?  1 : ((x > y) ? -1 : 0));
};

// Row editing for data tables
$('div.dataTables_wrapper td').live('dblclick', function (e) {
	var node = $(this);

	if (node.is('.editing, .no-edit'))
		return;

	var data = /BWOBJ (.*?)\/(.*?) /.exec(node.parent().html());
	if (!data)
		return;

	var model = botoweb.env.models[data[1]];

	if (!model)
		return;

	model.get(data[2], function (obj) {
		// Convert the column back to proper markup
		if (obj) {
			var table = node.parents('table');
			var data_table = table.data('data_table');

			var index = node.index();

			var template = data_table.opt.template.find('td:eq(' + index + ')');

			// Only fix the columns widths once
			if (table.css('table-layout') != 'fixed') {
				var headings = table.find('> thead> tr > th');

				// Lock the column widths. First we get the currently
				// displayed widths, then we set the table to fixed column
				// widths, then we apply those original widths back to the
				// column headings
				var widths = [];
				headings.each(function () {
					widths.push($(this).width());
				});
				table.css('table-layout', 'fixed');
				headings.each(function () {
					$(this).width(widths[0]);
					widths.shift();
				});
			}

			// Replace entire TD with original syntax
			var clone = template.clone();
			node.replaceWith(clone);
			node = clone;

			var first_attr = node.find(botoweb.ui.markup.sel.attribute).first();

			// Used to prevent editing while we're already editing
			node.addClass('editing');

			var block = new botoweb.ui.markup.Block(node, {
				obj: obj,
				editable: true,
				no_refresh: true
			});

			first_attr.triggerHandler('dblclick');

			// Not editable
			if (node.find('.prop_editor').length == 0)
				return;

			function reset_column (e, o) {
				var clone = template.clone();
				node.replaceWith(clone);

				new botoweb.ui.markup.Block(clone, {
					obj: (o || obj)
				});

				clone.prepend($(data_table.sort_string(clone.text())));

				// Update the sorting data, identify this row by its DOM
				// node and the column by its index. We give false to
				// prevent a redraw.
				data_table.data_table.fnUpdate(clone.html(), clone.parent().get(0), index, false);

				botoweb.ui.overlay.hide();

				if (index == 0)
					clone.append($('<!-- BWOBJ ' + obj.model.name + '/' + obj.id + ' -->'));
			}

			$(block).bind('save_complete edit_canceled', reset_column);

			node.find(botoweb.ui.markup.sel._attribute).remove();

			if (index == 0)
				node.append($('<!-- BWOBJ ' + obj.model.name + '/' + obj.id + ' -->'));
		}
	});
});

})(jQuery);
