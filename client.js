/*****************************
 * 
 * For invoke Alibaba Cloud Function Compute(FC) API
 * 
 * Please refer: https://help.aliyun.com/document_detail/53252.html?spm=a2c4g.11186623.6.694.5dcb17439lcd3w
 * 
 * @author santi
 * @date 2019-04-10
 * 
 ******************************/

/**
 * Sign with HmacSHA256
 * @param source
 * @param secret
 * @returns
 */
function signString(source, secret) {
   var signStrSha256 = CryptoJS.HmacSHA256(source, secret);
   var fcSign = CryptoJS.enc.Base64.stringify(signStrSha256);
   return fcSign;
}

/**
 * Get service name with qualifer
 * @param serviceName
 * @param qualifier
 * @returns
 */
function getServiceName(serviceName, qualifier) {
  if (qualifier) {
    return `${serviceName}.${qualifier}`;
  } 
  return serviceName;
}

/**
 * Encode query object to query string
 * @param obj
 * @return str
 */
queryToStr = function(obj) {
	var str = [];
	for (var p in obj) {
		if (obj.hasOwnProperty(p)) {
			str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
		}
	}
	return str.join("&");
}

/**
 * Build sing string of headers
 * @param headers
 * @param prefix
 * @returns
 */
function buildCanonicalHeaders(headers, prefix) {
	var list = [];
	var keys = Object.keys(headers);

	var fcHeaders = {};
	for (let i = 0; i < keys.length; i++) {
		let key = keys[i];

		var lowerKey = key.toLowerCase().trim();
		if (lowerKey.startsWith(prefix)) {
			list.push(lowerKey);
			fcHeaders[lowerKey] = headers[key];
		}
	}
	list.sort();

	var canonical = '';
	for (let i = 0; i < list.length; i++) {
		const key = list[i];
		canonical += `${key}:${fcHeaders[key]}\n`;
	}

	return canonical;
}

/**
 * 
 * @param method Http Method uppercase(GET, POST, PUT, DELETE...)
 * @param path $api-version/api-path
 * @param headers
 * @param queries
 * @returns
 */
function composeStringToSign(method, path, headers, queries) {
	const contentMD5 = headers['content-md5'] || '';
	const contentType = headers['content-type'] || '';
	const date = headers['date'] || headers['x-fc-date'];
	const signHeaders = buildCanonicalHeaders(headers, 'x-fc-');
	
	// Decode request path from uri
	var parser = document.createElement('a');
	parser.href = path;
	// const pathUnescaped = decodeURIComponent(parser.pathname);
	const pathUnescaped = parser.pathname;
	
	// Compose sign string
	var str = `${method}\n${contentMD5}\n${contentType}\n${date}\n${signHeaders}${pathUnescaped}`;
	if (queries) {
		var params = [];
		Object.keys(queries).forEach(function(key) {
			var values = queries[key];
			var type = typeof values;
			if (type === 'string') {
				params.push(`${key}=${values}`);
				return;
			}
			if (Array.isArray(values)) {
				queries[key].forEach(function(value) {
					params.push(`${key}=${value}`);
				});
			}
		});
		params.sort();
		str += '\n' + params.join('\n');
	}
	return str;
}

class Client {
	constructor(accountid, config) {
	    if (!accountid) {
	      throw new TypeError('"accountid" must be passed in');
	    }
		this.accountid = accountid;
		
		if (!config) {
		  throw new TypeError('"config" must be passed in');
		}
		
		const accessKeyID = config.accessKeyID;
		if (!accessKeyID) {
		  throw new TypeError('"config.accessKeyID" must be passed in');
		}
		
		this.accessKeyID = accessKeyID;
		
		if (this.accessKeyID.startsWith('STS')) {
		  this.securityToken = config.securityToken;
		  if (!this.securityToken) {
		    throw new TypeError('"config.securityToken" must be passed in for STS');
		  }
		}
		
		const accessKeySecret = config.accessKeySecret;
		if (!accessKeySecret) {
		  throw new TypeError('"config.accessKeySecret" must be passed in');
		}
		
		this.accessKeySecret = accessKeySecret;
		
		const region = config.region;
		if (!region) {
		  throw new TypeError('"config.region" must be passed in');
		}
		
		const protocol = config.secure ? 'https' : 'http';
		
		const internal = config.internal ? '-internal' : '';
		
		this.endpoint = `${protocol}://${accountid}.${region}${internal}.fc.aliyuncs.com`;
		this.host = `${accountid}.${region}${internal}.fc.aliyuncs.com`;
		this.version = '2016-08-15';
		this.timeout = Number.isFinite(config.timeout) ? config.timeout : 60000; // default
																					// is
																					// 60s
	    this.headers = config.headers || {};
    }

	buildHeaders() {
	    var now = new Date();
	    const headers = {
	      'accept': 'application/json',
		  'x-fc-date': now.toUTCString(),
		  'x-fc-host': this.host,
		  'x-fc-account-id': this.accountid
	    };

		if (this.securityToken) {
			headers['x-fc-security-token'] = this.securityToken;
		}
		return headers;
	}
  
  /**
	 * ??????Header ??????
	 * 
	 * @param {String}
	 *            accessKeyID
	 * @param {String}
	 *            accessKeySecret
	 * @param {String}
	 *            method : GET/POST/PUT/DELETE/HEAD
	 * @param {String}
	 *            path
	 * @param {json}
	 *            headers : {headerKey1 : 'headValue1'}
	 */
	static getSignature(accessKeyID, accessKeySecret, method, path, headers, queries) {
	  var stringToSign = composeStringToSign(method, path, headers, queries);
	  console.log('stringToSign:\n%s', stringToSign);
	  
	  var sign = signString(stringToSign, accessKeySecret);
	  console.log('sign: %s', sign);
	  
	  return `FC ${accessKeyID}:${sign}`;
	}

	request(method, path, query, body, headers = {}, opts = {}) {
		var url = `${this.endpoint}/${this.version}${path}`;
		if (query && Object.keys(query).length > 0) {
		  url = `${url}?${queryToStr(query)}`;
		}
		
		var headers = Object.assign(this.buildHeaders(), this.headers, headers);
		var postBody;
		if (body) {
		  // TODO convert to utf8
		  if (typeof body === 'string') {
		    postBody = body;
		    headers['content-type'] = 'application/octet-stream';
		  } else {
		    postBody = JSON.stringify(body);
		    headers['content-type'] = 'application/json';
		  }
		  const md5 = calcMD5(body);
		  headers['content-md5'] = md5;
		}
		
		var queriesToSign = null;
		if (path.startsWith('/proxy/')) {
		  queriesToSign = query || {};
		}
		var signature = Client.getSignature(this.accessKeyID, this.accessKeySecret, method, `/${this.version}${path}`, headers, queriesToSign);
		headers['authorization'] = signature;
		console.log('request headers: %s', JSON.stringify(headers));
		console.log('request url: ' + url);
		
		$.ajax({
		    url: url,
		    headers: headers,
		    method: method,
		    dataType: 'html',
		    data: postBody,
		    success: function(data){
		      console.log('=========Response=======\n%s', data);
		      document.write(data);
		    },
		    error: function(obj, status, data) {
		    	console.log("status: " + status + ', ' + JSON.stringify(data));
		        document.write(JSON.stringify(data));
		    }
		  });
	}
	
	get(path, query, headers) {
		return this.request('GET', path, query, null, headers);
	}
	
	post(path, body, headers, queries, opts = {}) {
		return this.request('POST', path, queries, body, headers, opts);
	}
	
	put(path, body, headers) {
	  return this.request('PUT', path, null, body, headers);
	}
	  
	delete(path, query, headers) {
		return this.request('DELETE', path, query, null, headers);
	}

	/**
	 * ??????Service
	 * 
	 * Options: - description Service??????????????? - logConfig log config - role Service
	 * role
	 * 
	 * @param {String}
	 *            serviceName ?????????
	 * @param {Object}
	 *            options ?????????optional
	 * @return {Promise} ?????? Object(??????headers???data??????[ServiceResponse])
	 */
	createService(serviceName, options = {}, headers) {
		return this.post('/services', Object.assign({serviceName,}, options), headers);
	}

	/**
	 * ??????Service??????
	 * 
	 * Options: - limit - prefix - startKey - nextToken
	 * 
	 * @param {Object}
	 *            options ?????????optional
	 * @return {Promise} ?????? Object(??????headers???data??????[Service ??????])
	 */
	listServices(options = {}, headers) {
		return this.get('/services', options, headers);
	}

  /**
	 * ??????service??????
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {Object}
	 *            headers
	 * @param {String}
	 *            qualifier
	 * @return {Promise} ?????? Object(??????headers???data??????[Service ??????])
	 */
  getService(serviceName, headers = {}, qualifier) {
    return this.get(`/services/${getServiceName(serviceName, qualifier)}`, null, headers);
  }

  /**
	 * ??????Service??????
	 * 
	 * Options: - description Service??????????????? - logConfig log config - role service
	 * role
	 * 
	 * @param {String}
	 *            serviceName ?????????
	 * @param {Object}
	 *            options ?????????optional
	 * @return {Promise} ?????? Object(??????headers???data??????[Service ??????])
	 */
  updateService(serviceName, options = {}, headers) {
    return this.put(`/services/${serviceName}`, options, headers);
  }

  /**
	 * ??????Service
	 * 
	 * @param {String}
	 *            serviceName
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  deleteService(serviceName, options = {}, headers) {
    return this.delete(`/services/${serviceName}`, null, options, headers);
  }

  /**
	 * ??????Function
	 * 
	 * Options: - description function??????????????? - code function?????? - functionName -
	 * handler - initializer - memorySize - runtime - timeout -
	 * initializationTimeout
	 * 
	 * @param {String}
	 *            serviceName ?????????
	 * @param {Object}
	 *            options Function??????
	 * @return {Promise} ?????? Function ??????
	 */
  createFunction(serviceName, options, headers) {
    this.normalizeParams(options);
    return this.post(`/services/${serviceName}/functions`, options, headers);
  }

  normalizeParams(opts) {
    if (opts.functionName) {
      opts.functionName = String(opts.functionName);
    }

    if (opts.runtime) {
      opts.runtime = String(opts.runtime);
    }

    if (opts.handler) {
      opts.handler = String(opts.handler);
    }

    if (opts.initializer) {
      opts.initializer = String(opts.initializer);
    }

    if (opts.memorySize) {
      opts.memorySize = parseInt(opts.memorySize, 10);
    }

    if (opts.timeout) {
      opts.timeout = parseInt(opts.timeout, 10);
    }

    if (opts.initializationTimeout) {
      opts.initializationTimeout = parseInt(opts.initializationTimeout, 10);
    }
  }

  /**
	 * ??????Function??????
	 * 
	 * Options: - limit - prefix - startKey - nextToken
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {Object}
	 *            options ?????????optional
	 * @param {Object}
	 *            headers
	 * @param {String}
	 *            qualifier ??????
	 * @return {Promise} ?????? Object(??????headers???data??????[Function??????])
	 */
  listFunctions(serviceName, options = {}, headers = {}, qualifier) {
    return this.get(`/services/${getServiceName(serviceName, qualifier)}/functions`, options, headers);
  }

  /**
	 * ??????Function??????
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {Object}
	 *            headers
	 * @param {String}
	 *            qualifier ??????
	 * @return {Promise} ?????? Object(??????headers???data??????[Function??????])
	 */
  getFunction(serviceName, functionName, headers = {}, qualifier) {
    return this.get(`/services/${getServiceName(serviceName, qualifier)}/functions/${functionName}`, null, headers);
  }

  /**
	 * ??????Function Code??????
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {Object}
	 *            headers
	 * @param {String}
	 *            qualifier ??????
	 * @return {Promise} ?????? Object(??????headers???data??????[Function??????])
	 */
  getFunctionCode(serviceName, functionName, headers = {}, qualifier) {
    return this.get(`/services/${getServiceName(serviceName, qualifier)}/functions/${functionName}/code`, headers);
  }

  /**
	 * ??????Function??????
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {Object}
	 *            options Function????????????createFunction
	 * @return {Promise} ?????? Object(??????headers???data??????[Function??????])
	 */
  updateFunction(serviceName, functionName, options, headers) {
    this.normalizeParams(options);
    const path = `/services/${serviceName}/functions/${functionName}`;
    return this.put(path, options, headers);
  }

  /**
	 * ??????Function
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  deleteFunction(serviceName, functionName, options = {}, headers) {
    const path = `/services/${serviceName}/functions/${functionName}`;
    return this.delete(path, options, headers);
  }

  /**
	 * ??????Function
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {Object}
	 *            event event??????
	 * @param {Object}
	 *            headers
	 * @param {String}
	 *            qualifier
	 * @return {Promise} ?????? Object(??????headers???data??????[??????Function???????????????])
	 */
  invokeFunction(serviceName, functionName, event, headers = {}, qualifier, opts = {} ) {
    const path = `/services/${getServiceName(serviceName, qualifier)}/functions/${functionName}/invocations`;
    return this.post(path, event, headers, null, opts);
  }

  /**
   * 
   * Invoke http trigger
   * @param method Http Method (GET, POST)
   * @param serviceName
   * @param functionName
   * @param headers
   * @param queries
   * @param qualifer Version qualifer
   * @param opts
   */
  invokeHttpFunction(method, serviceName, functionName, event, headers = {}, queries = {}, qualifier, opts = {}) {
    const path = `/proxy/${getServiceName(serviceName, qualifier)}/${functionName}/`;
    
    if (method == 'POST') {
    	return this.post(path, event, headers, queries, opts);
    } else {
        return this.get(path, queries, headers);
    }
  }

  /**
	 * ??????Trigger
	 * 
	 * Options: - invocationRole - sourceArn - triggerType - triggerName -
	 * triggerConfig - qualifier
	 * 
	 * @param {String}
	 *            serviceName ?????????
	 * @param {String}
	 *            functionName ?????????
	 * @param {Object}
	 *            options Trigger??????
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????[Trigger??????])
	 */
  createTrigger(serviceName, functionName, options, headers = {}) {
    const path = `/services/${serviceName}/functions/${functionName}/triggers`;
    return this.post(path, options, headers);
  }

  /**
	 * ??????Trigger??????
	 * 
	 * Options: - limit - prefix - startKey - nextToken
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {Object}
	 *            options ?????????optional
	 * @return {Promise} ?????? Object(??????headers???data??????[Trigger??????])
	 */
  listTriggers(serviceName, functionName, options = {}, headers) {
    const path = `/services/${serviceName}/functions/${functionName}/triggers`;
    return this.get(path, options, headers);
  }

  /**
	 * ??????Trigger??????
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {String}
	 *            triggerName
	 * @return {Promise} ?????? Object(??????headers???data??????[Trigger??????])
	 */
  getTrigger(serviceName, functionName, triggerName, headers) {
    const path = `/services/${serviceName}/functions/${functionName}/triggers/${triggerName}`;
    return this.get(path, null, headers);
  }

  /**
	 * ??????Trigger??????
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {String}
	 *            triggerName
	 * @param {Object}
	 *            options Trigger????????????createTrigger
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????[Trigger??????])
	 */
  updateTrigger(serviceName, functionName, triggerName, options = {}, headers = {}) {
    const path = `/services/${serviceName}/functions/${functionName}/triggers/${triggerName}`;
    return this.put(path, options, headers);
  }

  /**
	 * ??????Trigger
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            functionName
	 * @param {String}
	 *            triggerName
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  deleteTrigger(serviceName, functionName, triggerName, options, headers) {
    const path = `/services/${serviceName}/functions/${functionName}/triggers/${triggerName}`;
    return this.delete(path, options, headers);
  }

  /**
	 * ??????CustomDomain
	 * 
	 * Options: - protocol - routeConfig
	 * 
	 * @param {String}
	 *            domainName ??????
	 * @param {Object}
	 *            options ?????????optional
	 * @return {Promise} ?????? Object(??????headers???data??????[CustomDomainResponse])
	 */
  createCustomDomain(domainName, options = {}, headers) {
    return this.post('/custom-domains', Object.assign({
      domainName,
    }, options), headers);
  }

  /**
	 * ??????CustomDomain??????
	 * 
	 * Options: - limit - prefix - startKey - nextToken
	 * 
	 * @param {Object}
	 *            options ?????????optional
	 * @return {Promise} ?????? Object(??????headers???data??????[CustomDomain ??????])
	 */
  listCustomDomains(options = {}, headers) {
    return this.get('/custom-domains', options, headers);
  }

  /**
	 * ??????CustomDomain??????
	 * 
	 * @param {String}
	 *            domainName
	 * @return {Promise} ?????? Object(??????headers???data??????[CustomDomain ??????])
	 */
  getCustomDomain(domainName, headers) {
    return this.get(`/custom-domains/${domainName}`, null, headers);
  }

  /**
	 * ??????CustomDomain??????
	 * 
	 * Options: - protocol - routeConfig
	 * 
	 * @param {String}
	 *            domainName
	 * @param {Object}
	 *            options ?????????optional
	 * @return {Promise} ?????? Object(??????headers???data??????[Service ??????])
	 */
  updateCustomDomain(domainName, options = {}, headers) {
    return this.put(`/custom-domains/${domainName}`, options, headers);
  }

  /**
	 * ??????CustomDomain
	 * 
	 * @param {String}
	 *            domainName
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  deleteCustomDomain(domainName, options = {}, headers) {
    return this.delete(`/custom-domains/${domainName}`, null, options, headers);
  }

  /**
	 * ?????? version
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            description
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????[Version ??????])
	 */
  publishVersion(serviceName, description, headers) {
    var body = {};
    if (description) {
      body.description = description;
    }
    return this.post(`/services/${serviceName}/versions`, body, headers || {});
  }

  /**
	 * ?????? version
	 * 
	 * Options: - limit - nextToken - startKey - direction
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {Object}
	 *            options
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????[Version ??????])
	 */
  listVersions(serviceName, options = {}, headers = {}) {
    return this.get(`/services/${serviceName}/versions`, null, headers, options);
  }

  /**
	 * ?????? version
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            versionId
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  deleteVersion(serviceName, versionId, headers = {}) {
    return this.delete(`/services/${serviceName}/versions/${versionId}`, null, headers);
  }

  /**
	 * ?????? Alias
	 * 
	 * Options: - description - additionalVersionWeight
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            aliasName
	 * @param {String}
	 *            versionId
	 * @param {Object}
	 *            options
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  createAlias(serviceName, aliasName, versionId, options = {}, headers = {}) {
    options.aliasName = aliasName;
    options.versionId = versionId;

    return this.post(`/services/${serviceName}/aliases`, options, headers);
  }

  /**
	 * ?????? Alias
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            aliasName
	 * @param {String}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  deleteAlias(serviceName, aliasName, headers = {}) {
    return this.delete(`/services/${serviceName}/aliases/${aliasName}`, null, headers);
  }

  /**
	 * ?????? alias
	 * 
	 * Options: - limit - nextToken - prefix - startKey
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {Object}
	 *            options
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  listAliases(serviceName, options = {}, headers = {}) {
    return this.get(`/services/${serviceName}/aliases`, null, headers, options);
  }

  /**
	 * ?????? alias
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            aliasName
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  getAlias(serviceName, aliasName, headers = {}) {
    return this.get(`/services/${serviceName}/aliases/${aliasName}`, null, headers);
  }

  /**
	 * ?????? alias
	 * 
	 * Options: - description - additionalVersionWeight
	 * 
	 * @param {String}
	 *            serviceName
	 * @param {String}
	 *            aliasName
	 * @param {String}
	 *            versionId
	 * @param {Object}
	 *            options
	 * @param {Object}
	 *            headers
	 * @return {Promise} ?????? Object(??????headers???data??????)
	 */
  updateAlias(serviceName, aliasName, versionId, options = {}, headers = {}) {
    if (versionId) {
      options.versionId = versionId;
    }
    return this.put(`/services/${serviceName}/aliases/${aliasName}`, options, headers);
  }
}

/**
 * Test
 * @returns
 */
function testHttpInvoke() {
	var accountid = '';
	var accessKeyID = '';
	var accessKeySecret = '';
	var securityToken = '';
	var region = 'cn-hangzhou';
	var serviceName = 'test';
	var functionName = 'test';
	
	var fcClient = new Client(accountid, {
	  accessKeyID: accessKeyID,
	  accessKeySecret: accessKeySecret,
	  securityToken: securityToken,
	  region: region,
	  secure: "https",
	})
	
	var method = "GET";
	var body = "hello world";
	var headers = {
			"h1": "h_v1",
			"h2": "h_v2",
			"Set-Cookie": "cooooookies1;cooooookies2",
			"content-type": "application/octet-stream",
		};
	var queries = {
			"q1": "q_v1",
			"q2": "q_v2",
			"company": "alibaba",
			"address": "cn-hangzhou",
			"special": "=+\?"
		};
	var qualifier = "LATEST";
	fcClient.invokeHttpFunction(method, serviceName, functionName, body, headers, queries, qualifier);
	//fcClient.invokeFunction(serviceName, functionName, "{}");
}

