//Escaped Defects.  
//   Defects opened in sprint A but not closed in sprint A are considered escaped

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    config: {
        defaultSettings: {
            myQuery: '',
            model: 'Defect'
        }
    },
    launch: function() {
        var model = this.getSetting('model');

        var promises = [
            this.fetchIterations(),
            this.fetchDefects(model)
        ];

        this.setLoading("Loading historical and current data to compare...");
        Deft.Promise.all(promises).then({
            success: this.processData,
            failure: this.showErrorNotification,
            scope: this
        }).always(function(){
            this.setLoading(false);
        },
        this);
    },
    fetchIterations: function(){
        var deferred = Ext.create('Deft.Deferred');
        var thisApp = this;
        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Iteration',
            fetch: ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate'],
            filters: [],
            pageSize: 2000,
            limit: Infinity,
        });
        store.load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    thisApp.iterations = _.uniq(records, function (rec) { return thisApp.getIterationName(rec);});
                    thisApp.iterations = _.sortBy( thisApp.iterations, function (i) {
                       return new Date( Date.parse( i.get("EndDate"))) ;
                    });
                    thisApp.iterations = thisApp.iterations.reverse();
                    deferred.resolve(records);
                } else {
                    var errorMsg = "Faled to load Iterations" + operation.error && operation.error.errors.join(',br/>');
                    deferred.reject(errorMsg);
                }
            }
        });
        return store;
    },
    fetchDefects: function(model){
        var deferred = Ext.create('Deft.Deferred');

        var store = Ext.create('Rally.data.wsapi.Store',{
            model: model,
            fetch: ['FormattedID','Name','State','CreationDate','OpenedDate','ClosedDate'],
            filters: this.getFilters(),
            pageSize: 2000,
            limit: 'Infinity'
        });

        store.load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve(records);
                } else {
                    var errorMsg = "Failed to load Defect records: " + operation.error && operation.error.errors.join('<br/>');
                    deferred.reject(errorMsg);
                }
            }
        });

        return store;
    },
    processData: function(results){
        var iterationStore = results[0];
        var defectStore = results[1];
        var thisApp = this;
        
        console.log('Iterations = ', iterationStore);
        console.log('Defect Data =', defectStore);
        
        // construct an array of objects from the defectstore
        // that are not closed in the same iteration they were
        // created in.
        thisApp.relevantDefects = Ext.Array.filter(defectStore, function(item){
            console.log("Item= ", item);
            console.log("Created Date = ", item.get('CreatedDate'));
            console.log("Closed Date = ", item.get('ClosedDate'));
//           var iCreated = _.find(iterationStore, function(i){
//               thisApp.dateIn(item.get('CreatedDate'),i);
//           });
//           var iClosed = _.find(iterationStore, function(i){
//               thisApp.dateIn(item.get('ClosedDate'),i);
//           });
//           console.log("iCreated", iCreated);
//           console.log("iClosed", iClosed);
           return true;
        },thisApp);
        
        console.log("Relevant Defects", thisApp.relevantDefects);
        
        
        console.log("Adding Grid Now");
        this.addGrid(this.relevantDefects);
    },
    // returns true if the passed date string is in the iteration date range    
    dateIn : function ( ds, i ) {
        var d = new Date( Date.parse(ds));
        var b = new Date( Date.parse(i.get("StartDate")));
        var e = new Date( Date.parse(i.get("EndDate")));
        return (( d >= b) && ( d <= e ));
    },
    getFilters: function(){

        //From a query string
        var myQueryString = this.getSetting('myQuery'),
            queryFilters = [];

        if (myQueryString && myQueryString.length > 0){
            queryFilters = Rally.data.wsapi.Filter.fromQueryString(myQueryString);
        }

        return queryFilters;
    },
    addGrid: function(store){

        this.add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: [
                'FormattedID',
                'Name',
                'State',
                'CreationDate',
                'OpenedDate',
                'ClosedDate'
            ],
            showPagingToolbar: false
        });
    },
    getIterationName : function(i) {
        return i.get("Name").replace(/\./g, "_");
    },
    getSettingsFields: function() {
        return [{
            xtype: 'textareafield',
            name: 'myQuery',
            width: 500,
            fieldLabel: 'Query',
            labelAlign: 'right',
            validateOnChange: false,
            validateOnBlur: false,
            validator: function(value){
                try {
//                    console.log('value', value);
                    if (value && value.length){
                        Rally.data.wsapi.Filter.fromQueryString(value);
                    }
                } catch (e){
                    Rally.ui.notify.Notifier.showError({message: e.message});
                    console.log ("message", e.message);
                    return e.message;
                }
                return true;
            }
        }];
    }



});
