sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/Device",
    "sap/base/util/UriParameters",
    "PO_CREATEORDER/MyRouter"
], function (UIComponent, JSONModel, ODataModel, Device, UriParameters /*, MyRouter loaded for side-effect */) {
    "use strict";

    return UIComponent.extend("PO_CREATEORDER.Component", {

        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Device model — read-only, bound in views via device>/...
            var oDeviceModel = new JSONModel({
                isTouch: Device.support.touch,
                isNoTouch: !Device.support.touch,
                isPhone: Device.system.phone,
                isNoPhone: !Device.system.phone,
                listMode: Device.system.phone ? "None" : "SingleSelectMaster",
                listItemType: Device.system.phone ? "Active" : "Inactive",
                system: Device.system
            });
            oDeviceModel.setDefaultBindingMode("OneWay");
            this.setModel(oDeviceModel, "device");

            // Cross-controller shared state — replaces window._* globals
            this.setModel(new JSONModel({
                postName: "",
                postDescription: "",
                equipeName: "",
                equipeDescription: "",
                logo: "",
                homeLogo: "",
                oldLogo: "",
                backFromFLP: false
            }), "appState");

            this.setModel(new JSONModel(), "displaySettings");
            this.setModel(new JSONModel({ admin: false }), "userMode");
            this.setModel(new JSONModel({
                requestor: false,
                workType: false,
                groupCode: false
            }), "orderEnableFields");
            this.setModel(new JSONModel(), "functionalLocationData");

            // Start mock server when responderOn=true URL parameter is set
            var bIsMocked = UriParameters.fromQuery(window.location.search).get("responderOn") === "true";
            if (bIsMocked) {
                this._startMockServer();
            }

            this.getRouter().initialize();
        },

        _startMockServer: function () {
            sap.ui.require(["sap/ui/core/util/MockServer"], function (MockServer) {
                var sServiceUrl = "/sap/opu/odata/sap/ZGPM_CREATE_ORDER_SRV/";
                var oMockServer = new MockServer({ rootUri: sServiceUrl });
                var iDelay = +(UriParameters.fromQuery(window.location.search).get("responderDelay") || 0);
                MockServer.config({ autoRespondAfter: iDelay });
                oMockServer.simulate("model/metadata.xml", "model/");
                oMockServer.start();
                sap.ui.require(["sap/m/MessageToast"], function (MessageToast) {
                    MessageToast.show("Running in demo mode with mock data.", { duration: 4000 });
                });
            });
        }

    });
});