// Copyright 2015 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

// Controllers

angular.module('cherry.testLaunch', [])

// \todo [petri] rename to DeviceConfigSelectorCtrl?
.controller('TestLaunchCtrl', ['$scope', '$location', 'rtdb', 'rpc', function($scope, $location, rtdb, rpc)
{
	$scope.loadFullTestCaseTree();

	rtdb.bind('DeviceConfigList', 'deviceConfigList', $scope, { valueName: 'normalDevices' });
	rtdb.bind('ADBDeviceConnectionList', 'adbDeviceConnectionList', $scope, { valueName: 'adbDeviceConnections' });

	var testTreeAccess;

	angular.extend($scope,
	{
		selectedDeviceId:	undefined,
		deviceSettings:		{},		// child scopes will fill this with { deviceId:$scope.value }
		deviceError:		{},		//									{ deviceId:error } if the specific device has an error prohibiting test execution
		deviceIsADB:		{},

		selectDevice: function(deviceId)
		{
			$scope.selectedDeviceId = deviceId;
		},

		executeTestBatch: function()
		{
			// Combine final test filters string from test case tree selections and manually specified field.
			var testFilters = [];
			if (testTreeAccess.nodeSelected)
			{
				var str = genTestCaseTreeSubsetFilter($scope.fullTestCaseTree, testTreeAccess.nodeSelected);
				if (str !== '')
					testFilters.push(str);
			}
			if ($scope.testNameFilters)
				testFilters = testFilters.concat(_.filter($scope.testNameFilters.split(";"), function(f) { return f.length !== 0; }));
			testFilters = testFilters.join(";");

			// Use settings specified in the child element (device config).
			var deviceConfig = $scope.deviceSettings[$scope.selectedDeviceId];
			console.log('[exec] config "' + $scope.selectedDeviceId + '":');
			_.map(deviceConfig, function(value, key) { console.log('  ' + key + ': ' + JSON.stringify(value)); });

			var targetPort = parseInt(deviceConfig.targetPort) || 0;

			// \todo [petri] better error checking/handling
			if ($scope.deviceError.hasOwnProperty($scope.selectedDeviceId))
				alert($scope.deviceError[$scope.selectedDeviceId]);
			else if (!deviceConfig.targetAddress)
				alert('Invalid target address: "' + (deviceConfig.targetAddress || '') + '"');
			else if (targetPort <= 0)
				alert('Invalid target port: "' + targetPort + '"');
			else if (!testFilters)
				alert('No tests selected');
			else
			{
				var params = {
					targetAddress:			deviceConfig.targetAddress,
					targetPort:				targetPort,
					spawnLocalProcess:		deviceConfig.localProcessPath,
					deviceId:				$scope.selectedDeviceId,
					testBinaryName:			deviceConfig.binaryPath,
					testBinaryCommandLine:	deviceConfig.commandLine || '',
					testBinaryWorkingDir:	deviceConfig.workingDir,
					testNameFilters:		testFilters,
				};

				// Check if the queue that this execution would go to contains different devices, and not this one.
				// It's unlikely that one would like to queue (i.e. use same port for) different devices.
				rpc.call('rtdb.WouldQueueWithOnlyDifferentDevices', {
					targetAddress:	deviceConfig.targetAddress,
					targetPort:		targetPort,
					deviceId:		$scope.selectedDeviceId,
				})
				.then(function(wouldQueueWithOnlyDifferentDevices)
				{
					if (!wouldQueueWithOnlyDifferentDevices || confirm("Different device is using the same address and port - really queue?"))
					{
						rpc.call('rtdb.ExecuteTestBatch', params)
						.then(function(batchResultId)
						{
							console.log('Executing ' + batchResultId);
							$location.url('/results/batch/' + batchResultId);
						});
					}
				});
			}
		},

		setTestTreeAccess: function(access)
		{
			testTreeAccess = access;
		},

		testTreeSelectionType: function(event)
		{
			if (event.shiftKey)
				return 'area';
			return 'multiple';
		},
	});

	$scope.$watch('value.devices', function(devices)
	{
		// Auto-select first device.
		if ($scope.selectedDeviceId === undefined && devices && devices.length)
			$scope.selectedDeviceId = devices[0].id;
	});

	$scope.testCasePathFilter = '';

	var refilter = function()
	{
		if ($scope.fullTestCaseTree)
		{
			var pathFilterLower = $scope.testCasePathFilter.toLowerCase();
			filterTestCaseTree($scope.fullTestCaseTree, function(node) { return node.type !== 'testCase' || node.path.toLowerCase().indexOf(pathFilterLower) !== -1; });
		}
	};

	$scope.$watch('testCasePathFilter', refilter);

	$scope.titleExpr('"launch tests"');
}])

.controller('DeviceConfigCtrl', ['$scope', 'rtdb', 'rpc', function($scope, rtdb, rpc)
{
	var deviceId = '';
	var oldValue = {};

	var onObjectUpdate = function(objType, objId, value)
	{
		// Store value received from server for modification detection purposes.
		oldValue = angular.copy(value);

		// Expose our current parameters to parent, so it can launch tests with modified parameters.
		// \todo [petri] Is there a cleaner way to communicate this stuff to parent?
		$scope.$parent.deviceSettings[deviceId] = $scope.value;
	};

	angular.extend($scope,
	{
		isNewObject:	false,
		isSaving:		false,
		value:			{},

		initExisting: function(id)
		{
			deviceId = id;
			$scope.deviceIsADB[id] = false;
			rtdb.bind('DeviceConfig', deviceId, $scope, { onUpdate:onObjectUpdate });
		},

		initNew: function()
		{
			deviceId = '';
			$scope.isNewObject = true;
			$scope.deviceIsADB[deviceId] = false;
			$scope.$parent.deviceSettings[deviceId] = $scope.value;
		},

		initADB: function(connection)
		{
			$scope.initExisting(connection.deviceId);
			$scope.deviceIsADB[connection.deviceId] = true;
			$scope.adbConnection = connection;
		},

		isModified: function()
		{
			return !angular.equals(oldValue, $scope.value)
		},

		deleteConfig: function()
		{
			if ($scope.isNewObject)
				throw new Error('cannot delete new object');

			if (confirm('Really delete config "' + $scope.value.name + '"?'))
			{
				rpc.call('rtdb.DeleteDeviceConfig', deviceId)
				.then(function()
				{
					console.log('deleted device ' + deviceId);
					if ($scope.$parent.selectedDeviceId === deviceId)
						$scope.$parent.selectDevice(undefined);
				});
			}
		},

		saveConfig: function()
		{
			$scope.isSaving = true;

			var deviceConfig = angular.copy($scope.value);
			deviceConfig.targetPort = parseInt($scope.value.targetPort) || 0;

			rpc.call('rtdb.SaveDeviceConfig', { id:deviceId, config:deviceConfig })
			.then(function()
			{
				// If new empty, empty all values.
				if ($scope.isNewObject)
					$scope.value = {};

				$scope.isSaving = false;
				console.log('SAVED!');
			});
		}
	});

	$scope.$watch('adbConnection.state', function(connectionState)
	{
		if (connectionState)
		{
			if (connectionState != 'device')
				$scope.deviceError[deviceId] = 'Device unavailable (' + connectionState + ')';
			else
				delete $scope.deviceError[deviceId];
		}
	});
}])

;
