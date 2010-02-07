/**
 * Works with ajaxManager to queue and cache AJAX requests to allow more control
 * over active and pending AJAX.
 *
 * @author Chris Moyer
 */
botoweb.ajax = {
	cachedRequests: {},
	manager: $.manageAjax.create("cacheQueue", { queue: true, cacheResponse:false, preventDoubbleRequests: false, maxRequests: 3 }),
	stop: function(name, id){
		boto_web.ajax.cachedRequests = {};
		boto_web.ajax.manager.abort(name, id);
	},
	stop_by_url: function(url){
		var ajaxID = 'GET_'+ url.replace(/\./g, '_');
		boto_web.ajax.cachedRequests = {};
		boto_web.ajax.manager.abort(null, ajaxID);
	},
	get: function(url, callback){
		var ajaxID = 'GET_'+ url.replace(/\./g, '_');
		var cachedRequests = boto_web.ajax.cachedRequests;
		if(cachedRequests[ajaxID]){
			cachedRequests[ajaxID].push(callback);
		} else {
			cachedRequests[ajaxID] = [callback];

			boto_web.ajax.manager.add({
				success: function(data, status, xhr){
					var xhr = boto_web.ajax.manager.getXHR(ajaxID);
					for(cbnum in cachedRequests[ajaxID]){
						cachedRequests[ajaxID][cbnum](data, xhr);
					}
					delete cachedRequests[ajaxID];
				},
				url: url
			});
		}
	}
};