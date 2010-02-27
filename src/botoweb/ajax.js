/**
 * Works with ajaxManager to queue and cache AJAX requests to allow more control
 * over active and pending AJAX.
 *
 * @author Chris Moyer
 */
botoweb.ajax = {
	cachedRequests: {},
	manager: $.manageAjax.create('cacheQueue', { queue: true, cacheResponse:false, preventDoubbleRequests: false, maxRequests: 3 }),
	stop: function(name, id){
		botoweb.ajax.cachedRequests = {};
		botoweb.ajax.manager.abort(name, id);
	},
	stop_all: function(){
		botoweb.ajax.cachedRequests = {};
		botoweb.ajax.manager.abort('cacheQueue');
	},
	stop_by_url: function(url){
		var ajaxID = 'GET_'+ url.replace(/\./g, '_');
		botoweb.ajax.cachedRequests = {};
		botoweb.ajax.manager.abort(null, ajaxID);
	},
	get: function(url, callback){
		var ajaxID = 'GET_'+ url.replace(/\./g, '_');
		var cachedRequests = botoweb.ajax.cachedRequests;
		if(cachedRequests[ajaxID]){
			cachedRequests[ajaxID].push(callback);
		} else {
			cachedRequests[ajaxID] = [callback];

			botoweb.ajax.manager.add({
				success: function(data, status, xhr){
					var xhr = botoweb.ajax.manager.getXHR(ajaxID);
					for(cbnum in cachedRequests[ajaxID]){
						cachedRequests[ajaxID][cbnum](data, xhr);
					}
					delete cachedRequests[ajaxID];
				},
				error: function(data) {
					if (data.status == 408) {
						var r = this;
						setTimeout(function() {
							$.ajax(r);
						}, 250);
						return;
					}
				},
				url: url
			});
		}
	}
};