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

	if (opt.input) {
		opt.input = opt.input.toLowerCase();
		switch (opt.input) {
			case 'textarea-only': return new $forms.Textarea(prop, opt);
			case 'dropdown': return new $forms.Dropdown(prop, opt);
			case 'text': return new $forms.Text(prop, opt);
			case 'datetime': return new $forms.DateTime(prop, opt);
			case 'boolean': return new $forms.Boolean(prop, opt);
			case 'password': return new $forms.Password(prop, opt);
			case 'textarea': case 'file': case 'file-only': return new $forms.File(prop, opt);
			case 'propertymap': return new $forms.PropertyMap(prop, opt);
			case 'valuemap': return new $forms.ValueMap(prop, opt);
			case 'mapping': return new $forms.Mapping(prop, opt);
		}
	}

	if (prop.is_type('text') || prop.meta.maxlength > 1024)
		return new $forms.File(prop, opt); // will show textarea w/ upload toggle
	else if (prop.meta.choices)
		return new $forms.Dropdown(prop, opt);
	else if (prop.is_type('string'))
		return new $forms.Text(prop, opt);
	else if (prop.is_type('dateTime'))
		return new $forms.DateTime(prop, opt);
	else if (prop.is_type('reference','query'))
		return new $forms.Picklist(prop, opt);
	else if (prop.is_type('boolean'))
		return new $forms.Bool(prop, opt);
	else if (prop.is_type('password'))
		return new $forms.Password(prop, opt);
	else if (prop.is_type('blob'))
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
		this.obj_id = prop.obj_id;
		this.obj_model = prop.obj_model;
		this.model = prop.meta.model;

		this.node.addClass('prop_type_' + prop.meta.type + ' prop_name_' + prop.meta.name);

		// Lists are a special prop which can be of any type
		if (prop.is_type('list'))
			this.node.addClass('prop_type_list');
	}

	this.opt = $.extend(true, {
		allow_list: true,
		html: {
			tagName: 'input',
			attr: {}
		},
		choices: [],
		type: 'string'
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

			if (e.ctrlKey || e.metaKey)
				return;

			self.edit(true);

			e.stopPropagation();
			e.preventDefault();

			setTimeout(function () {
				self.fields[0].focus();
			}, 100);

			return false;
		}

		// In an attributeList, each property is in a row class. This check is
		// important for lists where their immediate parent may just be a <ul>.
		// We want to attach the event to the deepest parent that only contains
		// this property.
		if (this.node.parents('.row').find('.property').length == 1)
			this.node.parents('.row').dblclick(edit)

		// Otherwise check the immediate parent, useful for attributes not in an
		// attributeList
		else if (this.node.parent().find('.property').length == 1)
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
	this.add_field = function (value, opt) {
		opt = opt || {};

		if (typeof value != 'object')
			value = {val: value};

		var field = this.build_field(value, opt);

		// Allows field's DOM node to be mapped to the field by ID so that we
		// can preserve the order of lists.
		field.attr('id', this.fields.length + '_' + this.id)
			.addClass('edit_field');

		// Picklist has its own list handling
		if (!(this instanceof $forms.Picklist) && (this.opt.allow_multiple || this.prop && this.prop.is_type('list') && this.opt.allow_list)) {
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
		else if (field.find('.editing_template').length) {
			this.node.append(field);
		}
		else {
			field.hide();
			setTimeout(function () {
				field.css('width', self.node.width() - 4);
				field.show();
			}, 50);

			// Fixes an issue with query and reference types which is caused by
			// their editing templates being displayed before the search field,
			// this forces the search field to stay above the templates.
			if (this.prop && this.prop.is_type('query','reference'))
				this.node.prepend(field);
			else if (this.fields.length) {
				this.fields[this.fields.length - 1].after(field);
				field.before($('<br class="clear"/>'));
			}
			else
				this.node.append(field);
		}

		if ('decorate_field' in this)
			this.decorate_field(field);

		this.fields.push(field);

		return field;
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
		this.fields = [];

		if (this.prop.is_type('list') && this.opt.allow_list)
			this.node.append($ui.sortable($('<ul class="clear"/>')));

		this.set_values();

		// Picklist has its own list handling
		if (!(this instanceof $forms.Picklist) && (this.opt.allow_multiple || this.prop.is_type('list') && this.opt.allow_list)) {
			var add_selection = $ui.button('Add item', { icon: 'ui-icon-arrowthick-1-s', corners: [1,1,0,0] })
				.addClass('small add_selection')
				.click(function () {
					self.add_field();
					return false;
				}).prependTo(this.node);

			if (!this.prop.is_type('list'))
				add_selection.css('margin-left', 0);
		}

		if (this.prop.is_type('reference','query') && this.opt.template) {
			var txt = 'Create New ' + this.model.name;

			var button = $ui.button(txt, { icon: 'ui-icon-arrowthick-1-s', corners: [0,0,1,1] })
				.addClass('small add_selection create_new')
				.click(function () {
					xyz = true;
					var field = self.add_field(null, { use_template: true });

					setTimeout(function () {
						field.find('.editing_template :input:first').focus();
					}, 100);

					return false;
				}).insertAfter(this.node.find('.search:first'));

			if (!this.prop.is_type('list', 'query')) {
				$ui.button('Selecting or creating a new ' + this.prop.meta.label + ' will replace any existing selections.', {
					icon: 'ui-icon-alert',
					corners: [0,0,1,1],
					primary: false
				})
					.addClass('ar small ui-state-highlight add_selection_warning')
					.insertBefore(button);
			}
		}

		if (this.atomic) {
			var $styles = botoweb.env.cfg.styles;

			this.node.append(
				$('<br class="clear"/>'),
				$('<p/>').append(
					$ui.button('Save', '', true)
						.addClass('small')
						.click(function (e) {
							$ui.overlay.show();

							var val = self.val();

							if (val.length == 0)
								val = [{val: null}];

							var data = {};
							data[self.prop.meta.name] = val;

							// Refreshes the page when the save is successful
							function data_changed (obj) {
								function updated () {
									$($ldb.sync).unbind('end', updated);
									self.cancel();
								}

								function update() {
									$ui.overlay.hide();

									if (!self.opt.block.opt.no_refresh)
										$ui.page.refresh();

									$($ldb.sync).bind('end', updated);

									$ldb.sync.update();
								}

								$(self.opt.block).triggerHandler('save_complete', [obj, update]);

								if ($($forms).triggerHandler('save_complete', [obj, update]) !== false)
									update();
							}

							botoweb.Object.update(self.obj_model, self.obj_id, data, function (obj) {
								// Error, hide the overlay and let them edit again
								if ($('#bw-alert').length)
									$ui.overlay.hide();

								// If no object is returned this may be a special case
								else if (!obj) {
									// A referenced property may have been changed
									// so we will just wait awhile.
									// TODO some way to determine when everything is saved
									if (self.prop.is_type('query', 'reference'))
										setTimeout(data_changed, 1000);

									// Nothing was changed
									else
										$ui.overlay.hide();
								}
								// Normal case, object was updated
								else
									data_changed(obj);
							});

							e.preventDefault();
							return false;
						}),
					$ui.button('Cancel', '', false)
						.addClass('small')
						.click(function () {
							self.cancel();
							// Different from cancel_edit which is a request to
							// cancel the edit, edit_canceled indicates that the
							// edit has been canceled by the user.
							$(self.opt.block).triggerHandler('edit_canceled');
							return false;
						})
				)
			);
		}

		// Pull out a header
		// TODO decide if there is a better way to do this...
		if (this.opt.template) {
			this.opt.template.find('h2:first, h3:first').first()
				.clone()
				.addClass('clear')
				.prependTo(this.node);
		}

		if (this.opt.node) {
			this.opt.node.hide();

			// Lists often have multiple copies of the same node, so we need to
			// hide not only the target, but also its siblings which have the
			// same bwAttribute property.
			this.opt.node.siblings(
				$ui.markup.sel._attribute.replace(']',
					'=' + this.prop.meta.name + ']'
				)
			).hide();
		}

		this.node.show();

		return this;
	};

	this.set_default = function () {
		$.each(this.fields, function () {
			var val = self.prop.meta.def;

			if ('val' in self.opt) {
				val = self.opt.val;
			}
			else if ('def' in self.opt) {
				val = self.opt.def;
			}

			if (!$(this).val().length)
				$(this).val(val);
		});
	}

	this.set_values = function () {
		// Override value
		if ('val' in self.opt) {
			$.each(self.opt.val, function () {
				self.add_field(this);
			});
			return;
		}

		var val = this.prop.val();

		if (val && val.length && (val.length > 1 || val[0].val)) {
			$.each(val, function () {
				self.add_field(this);
			});
		}
		else {
			self.add_field(('def' in self.opt) ? self.opt.def : self.prop.meta.def);
		}
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
			botoweb.Model.update(this.model, this.obj_id, data);
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
		if (this.opt.node) {
			try {
				// The first element of a list is the template and should remain
				// hidden.
				if (!this.prop.is_type('list') || !this.opt.node.is(':empty'))
					this.opt.node.show();

				// Lists often have multiple copies of the same node, so we need to
				// show not only the target, but also its siblings which have the
				// same bwAttribute property.
				this.opt.node.siblings(
					$ui.markup.sel._attribute.replace(']',
						'=' + this.prop.meta.name + ']'
					)
				).show();
			} catch (e) {
				// Siblings will throw an error if the node is no longer in the
				// document.
			}
		}
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
			var field = self.fields[this.id.replace('_' + self.id, '') * 1];

			if (field) {
				var t = self.prop.meta.type;

				if (t != 'integer')
					t = self.opt.type;

				val.push({val: self.format(field.data('get_val')()), type: t});
			}
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

		if (this.opt.template) {
			return this.opt.template.clone().addClass('editing_template');
		}

		var field = $('<' + this.opt.html.tagName + '/>')
			.attr(this.opt.html.attr);

		// If the field supports choices this will add them
		this.reset_choices(field);

		field.val(value);

		field.data('get_val', function () {
			return field.val();
		});

		return field;
	};

	if (this.opt.block) {
		$(this.opt.block).bind('edit clone', function () {
			self.edit();
		});
		$(this.opt.block).bind('cancel_edit cancel_clone', function () {
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
			currentText: "<small>Go to current month</small>",
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
			}, 100);

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
		if (this.opt.val) {
			$.each(this.opt.val, function () {
				var ts = this.val.toString();

				// Timestamp may be in ISO 8601 format; convert it to a human
				// friendly date
				if (ts.indexOf('T') >= 0) {
					ts = botoweb.util.from_timestamp(ts);
				}

				self.add_field(ts);
			});
			return;
		}

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

			$.each((self.prop.meta.choices || self.opt.choices), function () {
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

		var field = $('<div><div class="al"><input type="radio" value="True"/> Yes &nbsp; <input type="radio" value="False"/> No &nbsp; </div></div>');

		// If the field supports choices this will add them
		this.reset_choices(field);

		field.find('input').attr({
			checked: false,
			// Random name just to make sure these function as radio buttons
			name: 'field_' + Math.round(Math.random() * 10000)
		});

		var val = self.prop.meta.def;

		if ('val' in self.opt) {
			val = self.opt.val;
		}
		else if ('def' in self.opt) {
			val = self.opt.def;
		}

		if (value == 'True')
			field.find('input[value=True]').attr('checked', true);
		else if (value == 'False')
			field.find('input[value=False]').attr('checked', true);
		else
			field.find('input[value=' + (val || 'False') + ']').attr('checked', true);

		field.data('get_val', function () {
			return field.find(':checked').val()
		});

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
			val.push({val: $(this).data('get_val')(), type: 'boolean'});
		});

		return val;
	};
};

$forms.File = function () {
	$forms.Field.apply(this, arguments);

	var self = this;

	if (this.opt.input && this.opt.input.indexOf('file') >= 0) {
		this.opt.html.attr.type = 'file';
		this.opt.html.tagName = 'input';
	}
	else
		this.opt.html.tagName = 'textarea';

	this.decorate_field = function (field) {
		if (this.opt.html.attr.type == 'file') {
			var button = $ui.button('Add File', { icon: 'ui-icon-folder-open' })
				.addClass('clear');

			field.replaceWith(button);

			if (this.opt.input != 'file-only') {
				button.before(
					$ui.button('Switch to Text Input', {icon: 'ui-icon-shuffle', primary: false})
						.addClass('small')
						.css('margin-bottom', '5px')
						.click(function () { self.toggle() })
				);
			}

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

			setTimeout(function () {
				button.siblings('br.clear').remove();
				selections.before($('<br class="clear"/>'));
			}, 10);

			$($forms).unbind('save_complete.' + this.id);
			$($forms).bind('save_complete.' + this.id, function (e, obj, fnc) {
				if (!self.editing || !upload._input || !upload._input.value)
					return;

				upload._settings.action = $util.url_join($ui.page.location.base_href, botoweb.env.base_url, self.model.href, obj.id, self.prop.meta.name);
				upload._settings.onComplete = function () {
					// Do not allow the handler to stick around
					$($forms).unbind('save_complete.' + self.id);

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

				setTimeout(function () {
					upload.submit()
				}, 1000);

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

/**
 * Allows a user to map freeform text inputs
 */
$forms.Mapping = function () {
	$forms.Field.apply(this, arguments);

	// Allow the user to add mappings
	this.opt.allow_multiple = true;

	var self = this;

	this.decorate_field = function (field) {
		var index = field.attr('id').replace(/_.*/, '') * 1;
		var key = '';

		if (this.prop.data)
			key = this.prop.data[index].key

		field.css('width', '30% !important');

		field.before(
			$('<input type="text" class="clear key al p30"/>')
				.val(key),
			$('<span class="al">&nbsp;maps to&nbsp;</span>'));
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
			var sel = $(this).val();
			var key = $(this).siblings('input.key').val();
			var index = this.id.replace(/_.*/, '') * 1;

			val.push({key: key, val: sel, type: 'string'});
		});

		return val;
	};
};

/**
 * Allows the users to map given keys to freeform values.
 */
$forms.ValueMap = function () {
	if (this.parent)
		this.parent.apply(this, arguments);
	else
		$forms.Field.apply(this, arguments);

	var self = this;

	this.decorate_field = function (field) {
		var index = field.attr('id').replace(/_.*/, '') * 1;

		if (!this.prop.data)
			return;

		field.before(
			$('<strong></strong>')
				.text(this.prop.data[index].key)
		).before($('<span> maps to</span>'));
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
			var sel = $(this).val();
			var index = this.id.replace(/_.*/, '') * 1;

			val.push({key: self.prop.data[index].key, val: sel, type: 'string'});
		});

		return val;
	};
};

/**
 * Allows the users to map given keys to a dropdown with the model's properties.
 */
$forms.PropertyMap = function () {
	this.parent = $forms.Dropdown;
	$forms.Mapping.apply(this, arguments);

	var self = this;

	if (this.opt.choices.length == 0) {
		var choices = $.map(this.model.props, function (prop) {
			return {
				name: prop.meta.label,
				value: prop.meta.name
			};
		});

		choices.push({
			name: 'ID',
			value: 'id'
		});

		choices.sort(botoweb.util.sort_props);
	}

	this.add_choices(choices);
};

$forms.Picklist = function () {
	$forms.Field.apply(this, arguments);

	var self = this;

	// The form will manage list behavior itself.
	this.opt.allow_list = false;

	this.model = botoweb.env.models[this.prop.meta.item_type];

	this.build_field = function (value, opt) {
		if (opt.use_template && this.opt.template && this.opt.template.length) {
			if (!this.opt.allow_multiple && !self.prop.is_type('list','query')) {
				self.node.find('.selections').empty();
				self.node.find('.editing_template').parent().remove();
			}

			var node = $('<div class="editing_template ui-state-default clear"/>').append(
				$('<div class="block"/>').append(
					this.opt.template.clone(),
					$('<br class="clear"/>')
				)
			);

			var block = new $ui.markup.Block(node, {
				model: this.model,
				obj: value,
				action: 'edit',
				editable: true
			});

			// Add a field to set the backreference, this is critical when
			// adding a new reference property
			if (self.prop.is_type('query')) {
				$.each(self.prop.meta.ref_props, function () {
					var ref_field = new $ui.forms.Text(new this.instance()).edit();

					ref_field.val = function () {
						// The parent object's ID is generated client-side so
						// that nested objects which must reference the parent
						// can do so even if the parent has not yet been created
						if (!self.opt.block.obj_id) {
							self.opt.block.obj_id = botoweb.util.uuid();
						}

						return [{val: self.opt.block.obj_id, id: self.opt.block.obj_id, type: self.opt.block.model.name}];
					};

					ref_field.node.attr('id', block.fields.length + '_' + block.id)
						.addClass('edit_field');

					block.fields.push(ref_field);

					node.find('.block').append(ref_field.node.hide())
				});
			}

			return $('<div class="clear"/>').append(
				$ui.button('Remove this selection', { icon: 'ui-icon-close', corners: [1,1,0,0] })
					.addClass('remove_editing_template small')
					.click(function () {
						$(this).parent().remove();

						if (value)
							self.node.find('#' + value.id).remove();
					}),
				block.node
			).data('get_val', function () {
				if (!block.saved) {
					if (!block.obj_id)
						block.obj_id = botoweb.util.uuid();

					block.save();
				}

				return [block.obj_id];
			});
		}

		var field = this.node.find('.ui-picklist');
		var new_field = false;

		if (!field.length) {
			field = $('<div class="ui-picklist"><div class="selections"></div><div class="search clear"></div></div>');
			new_field = true;
		}

		// Picklists may be marked as not searchable which means that the user
		// cannot search for new items to add to the list.
		if (this.opt.node) {
			var searchable = this.opt.node.attr($ui.markup.prop.searchable);

			if (searchable == 'false')
				field.find('.search, .selections').hide();

			this.filters = this.opt.node.attr($ui.markup.prop.filter);

			if (this.filters) {
				try {
					this.filters = $util.interpolate(this.filters, this.opt.block.obj);
					eval('this.filters = ' + this.filters);
				} catch (e) { console.error('Filter parsing error: ' + this.filters) }
			}
		}

		var selections = field.find('.selections:first');
		var search = field.find('.search:first');
		var search_results = $ui.nodes.search_results;

		var selecting = false;
		var autosearch;
		var autohide;
		var prev_value;
		var focused = false;

		var search_box = field.find('.search input');

		if (new_field) {
			var search_field = new $forms.Text();
			search_field.add_field();
			search_box = search_field.fields[0];
		}

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

		function add_selection (obj) {
			if (!obj)
				return;

			// obj may just be a string ID
			if (typeof obj == 'string') {
				self.model.get(obj, add_selection);
				return;
			}

			// Don't add if already selected
			if (selections.find('#' + obj.id).length == 0) {
				if (!self.opt.allow_multiple && !self.prop.is_type('list','query')) {
					selections.empty();
					self.node.find('.editing_template').parent().remove();
				}

				var template_field;
				if (self.opt.template) {
					template_field = self.add_field(obj, { use_template: true });
				}

				if (obj && obj.model) {
					selections.append(
						$('<div class="selection clear"/>')
							.attr('id', obj.id)
							.attr($ui.markup.prop.model, obj.model.name)
							.html(' ' + botoweb.env.cfg.format.picklist_result(obj.data.name.toString(), obj))
							.prepend(
								$ui.button('', { icon: 'ui-icon-close', no_text: true, mini: true, primary: false })
									.addClass('ui-state-error')
									.click(function () {
										$(this).parent().remove();

										if (template_field)
											template_field.remove();
									})
							)
					);
				}
			}

			cancel_search(true);
		}

		function do_search() {
			self.model.query([['name', 'like', '%' + search_box.val() + '%'],['name','sort','asc']], function (objs) {
				search_results.hide();
				selecting = true;

				// Reposition the search results
				var offset = search.offset();
				var results_offset = search_results.offset();
				var w = search_box.width();
				var h = search_box.height();

				var result_node = search_results.find('.search_results').empty();
				var items = [];

				search_results
					.unbind('mousedown mouseout')
					.mousedown(function () {
						setTimeout(function () {
							clearTimeout(autohide);
						}, 100);
					})
					.mouseout(function (e) {
						search_box.focus();
					});

				if (objs.length == 0) {
					result_node.html('<div class="jc"><strong>No results found</strong></div>');
				}
				else {
					// Get the string form of each object
					$.each(objs, function () {
						items.push({ obj: this, text: this.data.name.toString() });
					});

					// Sort alphabetically, ignoring a, an, and the
					items = items.sort(function (a, b) {
						return (a.text.toLowerCase().replace(/^\s*((the|a|an)\s+)?/, '') > b.text.toLowerCase().replace(/^\s+(the |a |an )?/, '')) ? 1 : -1;
					});

					// To allow faster data entry, if the user has already tabbed
					// out of the field, add the first matching item.
					if (!focused && search_box.val()) {
						if (items.length)
							add_selection(items[0].obj);

						return;
					}

					$.each(items, function (i, data) {
						result_node.append(
							$ui.button(botoweb.env.cfg.format.picklist_result(data.text, data.obj), { corners: [0,0,0,0] })
								.attr('id', data.obj.id)
								.click(function () {
									add_selection(data.obj);
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

		if (new_field) {
			search.append(
				search_box
					.addClass('al')
					.keyup(function (e) {
						// Down arrow does a search
						if (e.keyCode == 40 && !selecting)
							do_search();

						// Esc key hides the results
						else if (e.keyCode == 27)
							cancel_search();

						// Otherwise wait for a 500ms pause in typing
						else if (e.keyCode && this.value != prev_value) {
							clearTimeout(autosearch);

							if (this.value == '' && !selecting)
								cancel_search();
							else {
								cancel_search();
								autosearch = setTimeout(do_search, 500);
							}
						}

						prev_value = this.value;
					})
					.focus(function () {
						focused = true;
						clearTimeout(autohide);
					})
					.blur(function () {
						focused = false;
						autohide = setTimeout(cancel_search, 500);
					}),
				$ui.button('', { icon: 'ui-icon-search', no_text: true, corners: [0,1,1,0] })
					.click(function () {
						search_box.focus();
						do_search();
					})
			);
		}

		/*if (this.prop.data) {
			this.prop.val(function (objs) {
				$.each(objs, function () {
					if (this && this.val) {
						add_selection(this.val);
					}
				});
			})
		}*/

		function handle_val (objs) {
			var vals = 0;

			if (objs.length) {
				self.old_data = objs;
			}

			$.each(objs, function () {
				if (this.val) {
					vals++;
					add_selection(this.val);
				}
			});

			if (!vals && 'def' in self.opt) {
				vals++;
				add_selection(self.opt.def);
			}

			if (!vals && self.prop.meta.def) {
				add_selection(self.prop.meta.def);
			}
		}

		if ('val' in self.opt) {
			handle_val(self.opt.val);
		}
		else if (self.obj_id) {
			// Calling this immediately results in an unknown conflict with other things
			// that call .val on this property, so we delay a few ms.
			setTimeout(function () {
				if (self.opt.block && self.opt.block.obj) {
					self.opt.block.obj.val(self.prop.meta.name, handle_val, { filter: self.filters });
				}
				else {
					botoweb.Object.val(self.obj_model, self.obj_id, self.prop.meta.name, handle_val, { filter: self.filters });
				}
			}, 50);
		}
		// Still add defaults when this is not an object property. The val
		// callbacks will not work because there is no object to call them on.
		else {
			handle_val([]);
		}

		/**
		// Add a blank editing template if there are no existing selections.
		if (!vals && self.fields.length == 0 && self.opt.template) {
			setTimeout(function () {
				self.add_field(null, { use_template: true });
			}, 50);
		}
		*/

		field.data('get_val', function () {
			var val = [];

			selections.find('.selection').each(function() {
				val.push(this.id);
			});

			return val;
		});

		return field;
	};

	this.val = function () {
		var val = {};

		// Preserve field order according to the DOM
		this.node.find('> .edit_field').each(function () {
			var field = self.fields[this.id.replace('_' + self.id, '') * 1];

			if (field) {
				var v = field.data('get_val')();

				$.each(v, function () {
					val[this] = {val: this.toString(), id: this.toString(), type: self.prop.meta.item_type};
				});
			}
		});

		var a_val = [];

		for (var i in val)
			a_val.push(val[i]);

		return a_val;
	};
};

/**
 * Remove all non-global events attached to the central forms obj
 */
$forms.detach_events = function () {
	if ($($forms).data('events')) {
		var to_remove = [];

		$.each($($forms).data('events'), function () {
			$.each(this, function () {
				if (this.namespace != 'global')
					to_remove.push(this)
			});
		});

		$.each(to_remove, function () {
			$($forms).unbind(this.type, this.handler);
		});
	}
}

})(jQuery);