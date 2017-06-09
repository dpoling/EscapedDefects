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
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    thisApp.iterations = _.uniq(records, function (rec) { return thisApp.getIterationName(rec);});
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

        return deferred;
    },
    processData: function(results){
        var iterationStore = results[0];
        var defectStore = results[1];
        var thisApp = this;
        
//        console.log('Iteration Store = ', iterationStore);
//        console.log('Defect Store =', defectStore);
        
        // construct an array of objects from the defectstore
        // that are not closed in the same iteration they were
        // created in.
        thisApp.relevantDefects = Ext.Array.filter(defectStore, function(item){
           var creation = item.get('CreationDate');
           var closed = item.get('ClosedDate');
           console.log('DefectID= ', item.get('FormattedID'));
           var iCreated = _.find(iterationStore, function(i){
               thisApp.dateIn(creation,i);
           });
           var iClosed = _.find(iterationStore, function(i){
               thisApp.dateIn(closed,i);
           });
           console.log("iCreated=", iCreated);
           console.log("iClosed=", iClosed);
           
           return true;
        },thisApp);
        
        console.log("Relevant Defects", thisApp.relevantDefects);
        
        this.customStore = Ext.create('Rally.data.custom.Store',{
            data: this.relevantDefects
        });
        
        console.log("Adding Grid Now");
        this.addGrid(this.customStore);
    },
    // returns true if the passed date string is in the iteration date range    
    dateIn : function ( ds, i ) {
        var d = new Date( Date.parse(ds));
        var b = new Date( Date.parse(i.get("StartDate")));
        var e = new Date( Date.parse(i.get("EndDate")));
        var nm = i.get('Name');
        var rslt = ((d >= b) && (d <= e));
        if (rslt) {
            console.log('date, Name, Start, End: ', ds, nm, b, e);
        };
        return rslt;
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
                {dataIndex: 'FormattedID', text: 'Formatted ID'},
                {dataIndex: 'Name', text: 'Name', flex:1},
                {dataIndex: 'State', text: 'State', flex:1},
                {dataIndex: 'CreationDate', text: 'Creation Date', flex:1},
                {dataIndex: 'OpenedDate', text: 'Opened Date', flex:1},
                {dataIndex: 'ClosedDate', text: 'Closed Date', flex:1}
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
