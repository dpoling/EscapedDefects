//Escaped Defects.
//Defects opened in sprint A but not closed in sprint A are considered escaped
Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    config: {
        defaultSettings: {
            myQuery: '',
            model: 'Defect'
        }
    },
    launch: function () {
        var modelSet = this.getSetting('model');
        var promises = [
            this.fetchIterations(),
            this.fetchDefects(modelSet),
            this.createCustomModel(modelSet)
        ];
        this.setLoading("Loading Iterations and Artifacts...");
        Deft.Promise.all(promises).then({
            success: this.processData,
            failure: this.showErrorNotification,
            scope: this
        }).always(function () {
            this.setLoading(false);
        },
                this);
    },
    fetchIterations: function () {
        var deferred = Ext.create('Deft.Deferred');
        var thisApp = this;
        var store = Ext.create('Rally.data.wsapi.Store', {
            model: 'Iteration',
            fetch: ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate'],
            context: {
                projectScopeDown: false
            },
            sorters: [
                {
                    property: 'StartDate',
                    direction: 'DESC'
                }
            ],
            pageSize: 2000,
            limit: 'Infinity'
        });
        store.load({
            callback: function (records, operation) {
                if (operation.wasSuccessful()) {
                    thisApp.iterations = _.uniq(records, function (rec) {
                        return thisApp.getIterationName(rec);
                    });
//                    thisApp.iterations = _.sortBy( thisApp.iterations, function (i) {
//                       return new Date( Date.parse( i.get("StartDate"))) ;
//                    });
//                    thisApp.iterations = thisApp.iterations.reverse();
                    deferred.resolve(records);
                } else {
                    var errorMsg = "Faled to load Iterations" + operation.error && operation.error.errors.join(',br/>');
                    deferred.reject(errorMsg);
                }
            }
        });
        return deferred;
    },
    fetchDefects: function (modelType) {
        var deferred = Ext.create('Deft.Deferred');
        var store = Ext.create('Rally.data.wsapi.Store', {
            model: modelType,
            fetch: ['FormattedID', 'Name', 'State', 'CreationDate', 'OpenedDate', 'ClosedDate'],
            filters: this.getFilters(),
            pageSize: 2000,
            limit: 'Infinity'
        });
        store.load({
            callback: function (records, operation) {
                if (operation.wasSuccessful()) {
                    deferred.resolve(records);
                } else {
                    var errorMsg = "Failed to load Defect records: " + operation.error && operation.error.errors.join('<br/>');
                    deferred.reject(errorMsg);
                }
            }
        });
        return deferred;
    },
    createCustomModel: function (modelType) {
        var deferred = Ext.create('Deft.Deferred');
        console.log('Model Type: ', modelType);
        Rally.data.ModelFactory.getModel({
            type: modelType
        }).then({
            success: function (factoryModel) {
                console.log("success", factoryModel);
                deferred.resolve(Ext.define('EscapedDefects', {
                    extend: factoryModel,
                    fields: [
                        {name: 'StartSprint', type: 'String'},
                        {name: 'CloseSprint', type: 'String'}
                    ]
                })
                        );
            },
            failure: function () {
                console.log('Error extending defect model');
            },
            scope: this
        });
        return deferred;
    },
    processData: function (results) {
        var iterationStore = results[0];
        var defectStore = results[1];
        var customModel = results[2];
        var thisApp = this;
        console.log('customModel', customModel);
        // construct an array of objects from the defectstore
        // that are not closed in the same iteration they were
        // created in.
        thisApp.relevantDefects = [];
        Ext.Array.each(defectStore, function (item) {
            var iCreated = _.find(iterationStore, function (i) {
                return thisApp.dateIn(item.get('CreationDate'), i);
            });
            var iClosed = _.find(iterationStore, function (i) {
                return thisApp.dateIn(item.get('ClosedDate'), i);
            });
            if (iCreated && iClosed && iCreated.get('Name') !== iClosed.get('Name')) {
                var data = item.getData();
                data.StartSprint = iCreated.get('Name');
                data.CloseSprint = iClosed.get('Name');
                thisApp.relevantDefects.push(data);
            }
        });
        this.customStore = Ext.create('Rally.data.custom.Store', {
            model: customModel,
            data: thisApp.relevantDefects
        });
        console.log('customModel 2 ', customModel);
        this.addGrid(this.customStore);
    },
    // returns true if the passed date string is in the iteration date range
    dateIn: function (ds, i) {
        var d = new Date(Date.parse(ds));
        var b = new Date(Date.parse(i.get("StartDate")));
        var e = new Date(Date.parse(i.get("EndDate")));
        var rslt = ((d >= b) && (d <= e));
        return rslt;
    },
    getFilters: function () {
        //From a query string
        var myQueryString = this.getSetting('myQuery'),
                queryFilters = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'State',
                    value: 'Closed'
                });
        if (myQueryString && myQueryString.length > 0) {
            queryFilters = queryFilters.and(Rally.data.wsapi.Filter.fromQueryString(myQueryString));
        }
        return queryFilters;
    },
    addGrid: function (store) {
        this.add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: [
                {dataIndex: 'FormattedID', text: 'ID', width: 70, },
                {dataIndex: 'Name', text: 'Name', flex: 2},
                {dataIndex: 'State', text: 'State', width: 50},
                {dataIndex: 'CreationDate', text: 'Creation Date', width: 80},
                {dataIndex: 'ClosedDate', text: 'Closed Date', width: 80},
                {dataIndex: 'StartSprint', text: 'Started in', flex: 1},
                {dataIndex: 'CloseSprint', text: 'Closed in', flex: 1}
            ],
            showPagingToolbar: true
        });
    },

    getIterationName: function (i) {
        return i.get("Name").replace(/\./g, "_");
    },
    getSettingsFields: function () {
        return [{
                xtype: 'textareafield',
                name: 'myQuery',
                width: 500,
                fieldLabel: 'Query',
                labelAlign: 'right',
                validateOnChange: false,
                validateOnBlur: false,
                validator: function (value) {
                    try {
//                    console.log('value', value);
                        if (value && value.length) {
                            Rally.data.wsapi.Filter.fromQueryString(value);
                        }
                    } catch (e) {
                        Rally.ui.notify.Notifier.showError({message: e.message});
                        console.log("message", e.message);
                        return e.message;
                    }
                    return true;
                }
            }];
    }
});

