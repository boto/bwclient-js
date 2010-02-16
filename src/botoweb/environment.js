/**
 * Structures object and model data and provides abstractions for loading and
 * manipulating the data.
 *
 * @author Chris Moyer
 */

/**
 * This is the Environment class, intended to be instantiated
 * i.e: env = new botoweb.Environment("data");
 * Note that the loading of the routes and users happens asynchronously,
 * so if you need to make sure everything is loaded before you use it,
 * pass in a callback:
 * new botoweb.Environment("data", function(env){
 *     alert(env.user.username);
 * });
 *
 * @param {String} base_url The base URL that we are operating on
 * @param {Function} fnc Optional callback function to call after we finish loading
 */
botoweb.Environment = function(base_url, fnc, opts){
	// This is to support some weird things that
	// jQuery does while doing ajax processing, if
	// we ever need to refer to the Environment
	// object, we use "self"
	var self = this;
	self.base_url = base_url;
	self.user = null;
	self.opts = opts;
	self.routes = [];
	self.models = {};


	// __init__ object
	// Get our route info
	botoweb.ajax.get(self.base_url, function(xml){
		// Setup our name
		self.name = $(xml).find("Index").attr("name");
		// Get our version
		self.version = $(xml).find("Index").attr("version");
		$("#apiversion").text(self.version);
		// Set our routes and model APIs
		$(xml).find('api').map(function(){
			var mm = new botoweb.ModelMeta(this);
			var route = {
				href: mm.href,
				obj: mm.name
			};
			mm.href = mm.href;
			self.routes.push(route);
			eval("self.models." + mm.name + " = mm");
		});
		// Set our user object
		$(xml).find("User").each(function(){
			var obj = botoweb.parseObject(this);
			if(obj.length > 0){
				self.user = obj;
			}
		});

		if(fnc){ fnc(self); }
	});
};