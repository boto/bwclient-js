/**
 * Provides support for numerous native and non-native form elements.
 *
 * @author Ian Paterson
 */

(function ($) {

var $util = botoweb.util;
var $ui = botoweb.ui;
var $forms = $ui.forms;
var $ldb = botoweb.ldb;

$forms.prop_field = function (prop, opt) {
	opt = opt || {};

	if (prop.is_type('text') || opt.input == 'textarea' || prop.meta.maxlength > 1024)
		return new $forms.Textarea(prop, opt);
	else if (prop.meta.choices)
		return new $forms.Dropdown(prop, opt);
	else if (prop.is_type('string') || opt.input == 'text')
		return new $forms.Text(prop, opt);
	else if (prop.is_type('dateTime') || opt.input == 'dateTime')
		return new $forms.DateTime(prop, opt);
	else if (prop.is_type('reference'))
		return new $forms.Picklist(prop, opt);
	else if (prop.is_type('boolean'))
		return new $forms.Bool(prop, opt);
	else if (prop.is_type('password') || opt.input == 'password')
		return new $forms.Password(prop, opt);
	else if (prop.is_type('blob') || opt.input == 'file')
		return new $forms.File(prop, opt);
	else if (prop.is_type('complexType'))
		return new $forms.Mapping(prop, opt);
	else
		return new $forms.Text(prop, opt);
};

/**
 * Base abstract class for all form field types.
 *
 * @constructor
 */
$forms.Field = function (prop, opt) {
	var self = this;

	this.node = $('<div class="prop_editor"/>').hide();

	if (prop) {
		this.prop = prop;
		this.obj = prop.obj;
		this.model = prop.meta.model;
	}

	this.opt = $.extend(true, {
		allow_list: true,
		html: {
			tagName: 'input',
			attr: {}
		},
		choices: [],
		type: 'string',
		def: ''
	}, opt);

	this.template = this.opt.template;
	this.fields = [];
	this.editing = false;
	this.id = Math.round(Math.random() * 9999999);

	/**
	 * If the field is included in a larger editing operation it is not
	 * atomic. Otherwise, committing an update to the field will update just
	 * that property of the object.
	 */
	this.atomic = false

	if (this.opt.node) {
		this.node.insertAfter(this.opt.node);

		function edit (e) {
			if (self.editing) return;

			self.edit(true);

			e.stopPropagation();
			e.preventDefault();

			setTimeout(function () {
				self.fields[0].focus();
			}, 100);

			return false;
		}

		if (this.node.parent().find('.property').length == 1)
			this.node.parent().dblclick(edit)

		this.opt.node.dblclick(edit);
	}

	/**
	 * For fields such as dropdowns which have multiple choices, this method
	 * adds those choices. If the field is in editing mode, it also updates
	 * the UI with the new choices.
	 *
	 * @param {[Object]} choices An array of objects with the keys text and
	 * value.
	 * @param {Boolean} replace If true, existing choices will be removed.
	 */
	this.add_choices = function (choices, replace) {
		if (replace)
			this.opt.choices = choices;
		else
			$.merge(this.opt.choices, choices);

		if (self.editing) {
			// Must be defined in subclass
			this.reset_choices();
		}
	};

	/**
	 * Expands the form by adding another field or templated editor to allow
	 * input of multiple values. Generally this is only used on properties
	 * of type list, but since it can also be used to select multiple values
	 * for filtering a single-value property, this method is agnostic of the
	 * property type.
	 */
	this.add_field = function (value) {
		if (typeof value != 'object')
			value = {val: value};

		var field = this.build_field(value);

		// Allows field's DOM node to be mapped to the field by ID so that we
		// can preserve the order of lists.
		field.attr('id', this.fields.length + '_' + this.id)
			.addClass('edit_field');

		if (this.opt.allow_multiple || this.prop && this.prop.is_type('list') && this.opt.allow_list) {
			var sortable = this.prop && this.prop.is_type('list');

			var node;

			if (sortable)
				node = $('<li class="sortable_item clear"/>').append(field);
			else
				node = $('<div class="sortable_item"/>').append(field);

			node.hide();
			setTimeout(function () {
				if (sortable) {
					field.css('width', self.node.width() - 42);
					$ui.sort_icons(self.node.find('ul'));
				}
				else
					field.css('width', self.node.width() - 30);

				node.show();
			}, 50);

			field.addClass('al');

			if (sortable) {
				this.node.find('ul').append(node);
				field.before($('<span class="ui-icon"/>'));
			}
			else
				this.node.append(node);

			field.after(
				$ui.button('', { icon: 'ui-icon-close', no_text: true, corners: [0,1,1,0], primary: false })
					.attr('tabindex', -1)
					.click(function () {
						if (self.node.find('.sortable_item').length == 1)
							self.add_field();

						setTimeout(function () {
							node.remove();

							if (sortable)
								$ui.sort_icons(self.node.find('ul'));
						}, 50);
					}),
				$('<br class="clear"/>')
			);
		}
		else {
			field.hide();
			setTimeout(function () {
				field.css('width', self.node.width() - 4);
				field.show();
			}, 50);

			if (this.fields.length) {
				this.fields[this.fields.length - 1].after(field);
				field.before($('<br class="clear"/>'));
			}
			else
				this.node.append(field);
		}

		if ('decorate_field' in this)
			this.decorate_field(field);

		this.fields.push(field);
	};

	this.empty_fields = function () {
		$.each(this.fields, function () { this.parent().remove() });
	};

	/**
	 * Switches the form to editing mode. When the mode is switched, we
	 * generate a fresh UI for editing the item. This facilitates canceling
	 * changes and incorporating any updates to the data since the editing
	 * fields were constructed.
	 */
	this.edit = function (atomic) {
		this.atomic = atomic;
		this.node.empty();

		if (this.editing)
			this.node.empty();

		this.editing = true;

		if (this.prop.is_type('list') && this.opt.allow_list)
			this.node.append($ui.sortable($('<ul class="clear"/>')));

		this.set_default();

		this.set_values();

		if (this.prop.is_type('list') && this.opt.allow_list || this.opt.allow_multiple) {
			var add_selection = $ui.button('Add item', { icon: 'ui-icon-arrowthick-1-s', corners: [1,1,0,0] })
				.addClass('small add_selection')
				.click(function () {
					self.add_field();
					return false;
				}).prependTo(this.node);

			if (!this.prop.is_type('list'))
				add_selection.css('margin-left', 0);
		}

		if (this.atomic) {
			var $styles = botoweb.env.cfg.styles;

			this.node.append(
				$('<br class="clear"/>'),
				$('<p/>').append(
					$ui.button('Save', '', true)
						.addClass('small')
						.click(function () {
							var data = {};
							data[self.prop.meta.name] = self.val();

							$ui.overlay.show();

							self.obj.update(data, function (obj) {
								// We do not delete the ID key here because the
								// sync updater will check if it exists and
								// assign the updated object if it does.
								// Otherwise the null value will be ignored.
								//self.model.objs[self.obj.id] = null;

								function updated () {
									$($ldb.sync).unbind('end', updated);
									self.cancel();
									$ui.page.refresh();
									$ui.overlay.hide();
								}

								function update() {
									$($ldb.sync).bind('end', updated);

									$ldb.sync.update();
								}

								if ($($forms).triggerHandler('save_complete', [obj, update]) !== false)
									setTimeout(update, 1000);
							});
							return false;
						}),
					$ui.button('Cancel', '', false)
						.addClass('small')
						.click(function () {
							self.cancel();
							return false;
						})
				)
			);
		}

		if (this.opt.node)
			this.opt.node.hide();

		this.node.show();

		return this;
	};

	this.set_default = function () {
		$.each(this.fields, function () {
			if (!$(this).val())
				$(this).val(self.opt.def || self.prop.meta.def);
		});
	}

	this.set_values = function () {
		var val = this.prop.val();

		if (val && val.length) {
			$.each(val, function () {
				self.add_field(this);
			});
		}
		else
			self.add_field();
	};

	/**
	 * Switches the form to editing mode. When the mode is switched, we
	 * generate a fresh UI for editing the item. This facilitates canceling
	 * changes and incorporating any updates to the data since the editing
	 * fields were constructed.
	 */
	this.commit = function () {
		if (this.atomic) {
			var data = {};
			data[this.prop.name] = this.val();
			this.obj.update(data);
		}

		// Reset the property to view mode
		this.cancel();
	};

	/**
	 * Switches the form to editing mode. When the mode is switched, we
	 * generate a fresh UI for editing the item. This facilitates canceling
	 * changes and incorporating any updates to the data since the editing
	 * fields were constructed.
	 */
	this.cancel = function () {
		this.node.hide();
		this.opt.node.show();
		this.editing = false;
		this.node.empty();
		this.fields = [];
	};

	/**
	 * Updates the choices in the UI to the current value of
	 * this.opt.choices.
	 *
	 * Implementation will vary based on the UI component, must be
	 * overridden.
	 */
	this.reset_choices = function () { };

	/**
	 * Reformats data from the text field.
	 *
	 * Implementation will vary based on the UI component, should be
	 * overridden if needed.
	 */
	this.format = function (v) { return v; };

	/**
	 * Returns the value represented by the field selections for the purpose of
	 * saving that value to botoweb.
	 *
	 * @return A single value, an Array of values, or null.
	 */
	this.val = function () {
		var val = [];

		// Preserve field order according to the DOM
		this.node.find('.edit_field').each(function () {
			var field = self.fields[$(this).attr('id').replace('_' + self.id, '') * 1];

			val.push({val: self.format(field.val()), type: self.opt.type});
		});

		return val;
	};

	/**
	 * Generates the initial state of the editing field.
	 *
	 * Implementation may vary based on the UI component, this will handle
	 * basic form fields but should be overridden for more complex
	 * interfaces.
	 */
	this.build_field = function (value) {
		if (value)
			value = $util.html_unescape(value.val);
		else
			value = '';

		var field = $('<' + this.opt.html.tagName + '/>')
			.attr(this.opt.html.attr);

		// If the field supports choices this will add them
		this.reset_choices(field);

		field.val(value);

		return field;
	};

	if (this.obj) {
		$(this.obj).bind('edit clone', function () {
			self.edit();
		});
		$(this.obj).bind('cancel_edit cancel_clone', function () {
			self.cancel();
		});
	}
};

$forms.Text = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.attr.type = 'text';
};

$forms.Textarea = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.tagName = 'textarea';
};

$forms.DateTime = function () {
	$forms.Field.apply(this, arguments);
	this.opt.type = 'dateTime';

	var self = this;

	this.opt.html.attr.type = 'text';

	this.decorate_field = function (field) {
		var dp = field.datepicker({
			showAnim: 'drop',
			showOptions: {direction: 'down'},
			duration: 350,
			dateFormat: 'mm/dd/yy',
			showTime: true,
			time24h: false,
			altField: this.field,
			changeMonth: true,
			changeYear: true,
			constrainInput: false,
			showOtherMonths: true,
			selectOtherMonths: true,
			onClose: function(dateText, inst) {
				this.value = dateText.toUpperCase().replace(' 12:00 AM', '');
			},
			// timePicker is quite unable to position itself. As soon as the
			// datePicker starts to animate, we also position and start to
			// animate the timePicker with the same effect.
			beforeShow: function () {
				setTimeout(function () {
					$('#ui-timepicker-div').css('top', $('#ui-datepicker-div').parent().css('top'));
					$('#ui-timepicker-div').css('left', $('#ui-datepicker-div').offset().left + $('#ui-datepicker-div').width() + 5 + 'px');
					$('#ui-timepicker-div').show('drop', {direction: 'down'}, 340);
				}, 1);
			}
		});


		// Lists already have a clear button, if not a list we need a clear button
		if (!this.prop.is_type('list') && !this.opt.allow_multiple) {
			self.node.hide();
			setTimeout(function () {
				field.css('width', self.node.width() - 30);
				self.node.show();
			}, 50);

			field.addClass('al');

			field.after(
				$ui.button('', { icon: 'ui-icon-close', no_text: true, corners: [0,1,1,0], primary: false })
					.attr('tabindex', -1)
					.click(function () {
						field.val('');
					})
			);
		}
	};

	this.set_values = function () {
		var val = this.prop.toString(true);

		if (val && val.length) {
			$.each(val, function () {
				self.add_field({val: this.toString()});
			});
		}
		else
			self.add_field();
	};
};

$forms.Password = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.attr.type = 'password';
};

$forms.Dropdown = function () {
	$forms.Field.apply(this, arguments);

	this.opt.html.tagName = 'select';

	var self = this;

	/**
	 * Updates the choices in the UI to the current value of
	 * this.opt.choices.
	 */
	this.reset_choices = function (field) {
		function reset_choices () {
			var field = $(this);
			field.empty();

			if (self.opt.default_choice)
				field.append($('<option/>').text(self.opt.default_choice.name).val(self.opt.default_choice.value));
			else if (!('default_choice' in self.opt))
				field.append($('<option/>'));

			$.each(self.prop.meta.choices, function () {
				if (this.name || this.value)
					field.append($('<option/>').text(this.name || this.value).val(this.value));
			});
		}

		if (field)
			reset_choices.call(field);
		else
			$.each(this.fields, reset_choices);
	};
};

$forms.Bool = function () {
	$forms.Field.apply(this, arguments);
	this.opt.type = 'boolean';

	var self = this;

	this.build_field = function (value) {
		if (value)
			value = value.val;

		var field = $('<div><div class="al"><input type="radio" value="1"/> Yes &nbsp; <input type="radio" value="0"/> No &nbsp; </div></div>');

		field.append(
			$ui.button('Clear')
				.addClass('small')
				.click(function () {
					field.find('input').attr('checked', false);
				})
		);

		// If the field supports choices this will add them
		this.reset_choices(field);

		field.find('input').attr({
			checked: false,
			// Random name just to make sure these function as radio buttons
			name: 'field_' + Math.round(Math.random() * 10000)
		});

		if (value !== null)
			field.find('input[value=' + value + ']').attr('checked', true);

		return field;
	};

	/**
	 * Returns the value represented by the field selections for the purpose of
	 * saving that value to botoweb.
	 *
	 * @return A single value, an Array of values, or null.
	 */
	this.val = function () {
		var val = [];

		// Preserve field order according to the DOM
		this.node.find('.edit_field').each(function () {
			var selected = $(this).find(':checked');

			val.push({val: selected.val(), type: 'boolean'});
		});

		return val;
	};
};

$forms.File = function () {
	$forms.Field.apply(this, arguments);

	var self = this;

	this.opt.html.tagName = 'textarea';

	this.decorate_field = function (field) {
		if (this.opt.html.attr.type == 'file') {
			var button = $ui.button('Add File', { icon: 'ui-icon-folder-open' })
				.addClass('clear');

			field.replaceWith(button);

			button.before(
				$ui.button('Switch to Text Input', {icon: 'ui-icon-shuffle', primary: false})
					.addClass('small')
					.css('margin-bottom', '5px')
					.click(function () { self.toggle() })
			);

			var selections = $('<div class="selections clear"/>').insertAfter(button)
				.css('margin-top', '5px');

			var upload = new AjaxUpload(button, {
				name: this.prop.meta.name,
				autoSubmit: false,
				onChange: function (file, ext) {
					selections.empty();

					selections.append(
						$('<div class="selection"/>')
							.html('&nbsp;' + file)
							.prepend(
								$ui.button('', { icon: 'ui-icon-close', no_text: true, mini: true, primary: false })
									.addClass('ui-state-error')
									.click(function () {
										self.cancel();
										self.edit(self.atomic);
									})
							)
					);
				}
			});

			/* Uploadify will not work until Flash supports Basic Auth
			field.uploadify({
				uploader: '/swf/uploadify.swf',
				cancelImg: '/images/cancel.png',
				buttonImg: '/images/add_file.png',
				width: 75,
				height: 18,
				method: 'POST',
				scriptData: { name: this.prop.meta.name }
			});
			*/

			setTimeout(function () {
				button.siblings('br.clear').remove();
				selections.before($('<br class="clear"/>'));
			}, 10);

			$($forms).bind('save_complete.' + this.id, function (e, obj, fnc) {
				/* Uploadify will not work until Flash supports Basic Auth
				field.uploadifySettings('script', $util.url_join(botoweb.env.base_url, self.model.href, self.obj.id, self.prop.meta.name));
				field.uploadifySettings('onError', function (e,q,f,error) {
					alert(error.info)
				});
				field.uploadifySettings('onComplete', function () {
					if (fnc)
						fnc();
				});
				field.uploadifyUpload();
				*/

				upload._settings.action = $util.url_join($ui.page.location.base_href, botoweb.env.base_url, self.model.href, self.obj.id, self.prop.meta.name);
				upload._settings.onComplete = function () {
					selections.find('.ui-icon')
						.removeClass('ui-icon-clock')
						.addClass('ui-icon-check');
					if (fnc)
						fnc();
				}

				selections.find('.ui-icon')
					.removeClass('ui-icon-close')
					.addClass('ui-icon-clock');
				selections.find('.ui-state-error')
					.removeClass('ui-state-error')
					.addClass('ui-state-default')
					.unbind();

				upload.submit();

				return false;
			});
		}
		else {
			field.before(
				$ui.button('Switch to File Uploader', {icon: 'ui-icon-shuffle', primary: false})
					.addClass('small')
					.css('margin-bottom', '5px')
					.click(function () { self.toggle() })
			);
		}
	};

	this.toggle = function () {
		$($forms).unbind('save_complete.' + this.id);

		if (this.opt.html.tagName == 'textarea') {
			this.opt.html.attr.type = 'file';
			this.opt.html.tagName = 'input';
		}
		else {
			delete this.opt.html.attr.type;
			this.opt.html.tagName = 'textarea';
		}

		this.node.empty();
		this.fields = [];

		this.edit(this.atomic);
	}
};

$forms.Mapping = function () {
	$forms.Field.apply(this, arguments);

	//this.build_field = function () {

	//};
};

$forms.Picklist = function () {
	$forms.Field.apply(this, arguments);

	var self = this;

	// The form will manage list behavior itself.
	this.opt.allow_list = false;

	this.model = botoweb.env.models[this.prop.meta.item_type];

	this.build_field = function (value) {
		var field = $('<div class="ui-picklist"><div class="selections"></div><div class="search clear"></div></div>');
		var selections = field.find('.selections:first');
		var search = field.find('.search:first');
		var search_results = $ui.nodes.search_results;

		var search_field = new $forms.Text();

		var selecting = false;
		var autosearch;
		var prev_value;

		search_field.add_field();

		var search_box = search_field.fields[0];

		field.hide();
		setTimeout(function () {
			search_box.css('width', self.node.width() - 30);
			field.show();
		}, 50);

		function navigate_results (e) {
			if (e.keyCode == 13) {
				add_selection(search_results.find('button.ui-state-highlight').attr('id'));
				return;
			}

			if (e.keyCode != 40 && e.keyCode != 38)
				return;

			var current = search_results.find('button.ui-state-highlight');

			var target;

			if (e.keyCode == 40)
				target = current.next().addClass('ui-state-highlight');
			else
				target = current.prev().addClass('ui-state-highlight');

			if (target.length) {
				var position = target.position();

				search_results.stop();
				search_results.scrollTo(target, 250, {offset: -60});

				current.removeClass('ui-state-highlight');
			}
		}

		function cancel_search (clear_value) {
			selecting = false;
			search_results.hide();
			search_box.unbind('keyup', navigate_results);

			if (clear_value)
				search_box.val('');
		}

		function add_selection (id) {
			// Don't add if already selected
			if (selections.find('#' + id).length == 0) {
				if (!self.prop.is_type('list'))
					selections.empty();

				self.model.get(id, function (obj) {
					if (obj) {
						selections.append(
							$('<div class="selection"/>')
								.attr('id', obj.id)
								.attr($ui.markup.prop.model, obj.model.name)
								.text(' ' + obj.data.name.toString())
								.prepend(
									$ui.button('', { icon: 'ui-icon-close', no_text: true, mini: true, primary: false })
										.addClass('ui-state-error')
										.click(function () {
											$(this).parent().remove();
										})
								)
								.append(
									$('<span class="small"/>').text(' (' + obj.model.name + ')')
								)
						);
					}
				});
			}

			cancel_search(true);
		}

		function do_search() {
			self.model.query([['name', 'like', '%' + search_box.val() + '%']], function (objs) {
				search_results.hide();
				selecting = true;

				// Reposition the search results
				var offset = search.offset();
				var results_offset = search_results.offset();
				var w = search_box.width();
				var h = search_box.height();

				var result_node = search_results.find('.search_results').empty();
				var items = [];

				if (objs.length == 0) {
					result_node.html('<div class="jc"><strong>No results found</strong></div>');
				}
				else {
					// Get the string form of each object
					$.each(objs, function () {
						items.push({ id: this.id, text: this.data.name.toString(), model: this.model.name });
					});

					// Sort alphabetically, ignoring a, an, and the
					items = items.sort(function (a, b) {
						return (a.text.toLowerCase().replace(/^\s*((the|a|an)\s+)?/, '') > b.text.toLowerCase().replace(/^\s+(the |a |an )?/, '')) ? 1 : -1;
					});

					$.each(items, function (i, obj) {
						result_node.append(
							$ui.button('<div class="ar small">' + obj.model + '</div>' + obj.text, { corners: [0,0,0,0] })
								.attr('id', obj.id)
								.click(function () {
									add_selection(obj.id);
								})
						);
					});

					result_node.find('*:first').addClass('ui-state-highlight');
				}

				search_box.keyup(navigate_results);

				var new_h = (objs.length || 1) * 20;

				if (results_offset.left != offset.left || results_offset.top != offset.top + h) {
					search_results.css({
						left: offset.left + 1 + 'px',
						top: offset.top + h + 1 + 'px',
						width: w - 4 + 'px',
						height: ((new_h > 200) ? 200 : new_h) + 'px'
					});

					if (new_h > 200)
						result_node.css('padding-right', '15px');

					search_results.slideDown(function () {
						if (new_h > 200)
							result_node.css('padding-right', '');
					});
				}

				search_results.show();
			});
		}

		search.append(
			search_box
				.addClass('al')
				.keyup(function (e) {
					if (e.keyCode == 40 && !selecting)
						do_search();
					else if (e.keyCode) {
						clearTimeout(autosearch);

						if (this.value == '' && !selecting)
							cancel_search();
						else if (this.value != prev_value) {
							cancel_search();
							autosearch = setTimeout(do_search, 750);
						}
					}

					prev_value = this.value;
				}),
			$ui.button('', { icon: 'ui-icon-search', no_text: true, corners: [0,1,1,0] })
				.click(do_search)
		);

		if (this.prop.data) {
			this.prop.val(function (objs) {
				$.each(objs, function () {
					if (this && this.val)
						add_selection(this.val.id);
				});
			})
		}

		return field
	};
};

})(jQuery);