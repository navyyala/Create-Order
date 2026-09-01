sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/UIComponent",
    "sap/m/SplitAppMode",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/ui/util/Storage"
], function (Controller, Filter, FilterOperator, JSONModel, UIComponent, SplitAppMode,
             MessageToast, Dialog, Button, Text, Storage) {
    "use strict";

    return Controller.extend("PO_CREATEORDER.controller.Master", {

        /** Registers list listeners, applies colour classes, and subscribes to route and event bus events. */
        onInit: function () {
            this._oEventBus = this.getOwnerComponent().getEventBus();
            this._oInitialLoadFinishedDeferred = jQuery.Deferred(); // kept for compatibility

            var oList = this.getView().byId("list");
            oList.attachEvent("updateFinished", function () {
                this._oInitialLoadFinishedDeferred.resolve();
                // Apply dynamic CSS colour classes from OData data
                oList.getItems().forEach(function (oItem) {
                    oItem.addStyleClass(oItem.data("color"));
                });
                this.getView().setModel(new JSONModel(
                    oList.getItems().map(function (oItem) { return oItem.data("color"); })
                ), "modelColor");
            }, this);

            if (sap.ui.Device.system.phone) {
                return;
            }
            this.getRouter().attachRoutePatternMatched(this._onRouteMatched, this);
            this._oEventBus.subscribe("Detail", "GoHome", this._onGoHome, this);

            var oHomeBtn = sap.ui.getCore().byId("homeBtn");
            if (oHomeBtn) {
                oHomeBtn.setVisible(false);
            }
        },

        /** Lifecycle hook — no implementation required. */
        onAfterRendering: function () {},

        /** Flags app state for FLP back-navigation on controller destruction. */
        onExit: function () {
            var oState = this._getAppState();
            if (oState) {
                oState.setProperty("/backFromFLP", true);
            }
        },

        /** Navigates back to the FLP home screen via cross-app navigation. */
        onNavBack: function () {
            var oState = this._getAppState();
            if (oState) {
                oState.setProperty("/backFromFLP", true);
            }
            sap.ushell.Container.getService("CrossApplicationNavigation").toExternal({
                target: { semanticObject: "#" }
            });
        },

        /** Reloads data when returning from the confirm app, then shows the detail view. */
        _onRouteMatched: function (oEvent) {
            if (oEvent.getParameter("name") !== "main") {
                return;
            }

            // Reload if navigating back from the Confirm Order app
            var oStorage = new Storage(Storage.Type.session, "po_createorder");
            if (oStorage.get("from") === "maintenance") {
                oStorage.clear();
                this.getOwnerComponent().getModel().refresh(true);
                return;
            }
            this._loadDetailView();
        },

        /** Navigates to the Detail view without changing the URL hash. */
        _loadDetailView: function () {
            this.getRouter().myNavToWithoutHash({
                currentView: this.getView(),
                targetViewName: "PO_CREATEORDER.view.Detail",
                targetViewType: "XML"
            });
        },

        /** Filters the object list by description substring. */
        onSearch: function () {
            this._oInitialLoadFinishedDeferred = jQuery.Deferred();
            var sSearchString = this.getView().byId("searchField").getValue();
            var aFilters = sSearchString
                ? [new Filter("Description", FilterOperator.Contains, sSearchString)]
                : [];
            this.getView().byId("list").getBinding("items").filter(aFilters);
            if (sap.ui.Device.system.phone) {
                return;
            }
        },

        /** Handles functional-location item selection and navigates to the detail route. */
        onSelect: function () {
            this.getView().byId("listNav").removeSelections(true);
            var oSelectedItem = this.getView().byId("list").getSelectedItem();
            var sNameSelected = oSelectedItem.getBindingContext().getPath().split("'")[1];

            if (sNameSelected) {
                var aFilters = [
                    new Filter("Name", FilterOperator.Contains, sNameSelected),
                    new Filter("ObjType", FilterOperator.EQ, oSelectedItem.data("objType"))
                ];
                this.getView().byId("list").getBinding("items").filter(aFilters);
                this.getView().byId("listNav").getBinding("items").filter(aFilters);
                this._tmpObjTypeSelected = oSelectedItem.data("objType") || "F";
                this._oEventBus.publish("Master", "ShowLogo");
            }

            var sOrderAllowed = this.getView().getModel().getProperty(
                "/FUNCLEVELSet('" + sNameSelected + "')/OrderAllowed");
            if (sOrderAllowed === "X") {
                this._oEventBus.publish("Master", "ShowCanvas");
            } else {
                this._oEventBus.publish("Master", "ShowLogo");
            }

            // Persist selection in shared app state instead of window globals
            var oState = this._getAppState();
            oState.setProperty("/logo", oSelectedItem.data("base64") || "");
            this.getOwnerComponent().getModel("functionalLocationData").setProperty("/Id", sNameSelected);

            var bReplace = !sap.ui.Device.system.phone;
            this.getRouter().navTo("detail", {
                entity: oSelectedItem.getBindingContext().getPath().substr(1)
            }, bReplace);
        },

        /** Handles sub-level navigation item selection and updates catalogue filters. */
        onSelectNav: function () {
            this.getView().byId("list").removeSelections(true);
            var oSelectedItem = this.getView().byId("listNav").getSelectedItem();
            var sNameSelected = oSelectedItem.data("name");

            var oState = this._getAppState();
            oState.setProperty("/logo", oSelectedItem.data("base64") || "");

            if (sNameSelected) {
                var aFilters = [
                    new Filter("Name", FilterOperator.Contains, sNameSelected),
                    new Filter("ObjType", FilterOperator.Contains, this._tmpObjTypeSelected || "F")
                ];
                this.getView().byId("list").getBinding("items").filter(aFilters);
                this.getView().byId("listNav").getBinding("items").filter(aFilters);
            }

            var sOrderAllowed = this.getView().getModel().getProperty(
                "/FUNCLEVELSet('" + sNameSelected + "')/OrderAllowed");
            if (sOrderAllowed === "X") {
                this._oEventBus.publish("Master", "ShowCanvas");
            } else {
                this._oEventBus.publish("Master", "ShowLogo");
            }

            oState.setProperty("/postDescription", oSelectedItem.getTitle() || "");
            oState.setProperty("/equipeDescription", "");
        },

        /** Returns the component router. */
        getRouter: function () {
            return UIComponent.getRouterFor(this);
        },

        /** Resets the master list filters and returns the SplitApp to ShowHide mode. */
        onRefreshList: function () {
            var oSplitApp = this.getRouter()._findSplitApp(this.getView());
            if (oSplitApp) { oSplitApp.setMode(SplitAppMode.ShowHideMode); }
            this.getView().byId("list").getBinding("items").filter([]);
            this.getView().byId("list").setSelectedItem(null);
            this.getView().byId("listNav").getBinding("items").filter([]);
            var oState = this._getAppState();
            oState.setProperty("/logo", oState.getProperty("/homeLogo"));
            this._oEventBus.publish("Master", "ShowLogo");
            this._oEventBus.publish("Master", "clearPlan");
        },

        /** Prompts for confirmation then navigates to the FLP home screen. */
        onHome: function () {
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var oSelf = this;
            var oDialog = new Dialog({
                title: oI18n.getText("homeDialogTitle"),
                type: "Message",
                content: new Text({ text: oI18n.getText("questionRetourAccueil") }),
                beginButton: new Button({
                    text: oI18n.getText("reponseOui"),
                    press: function () {
                        oDialog.close();
                        sap.ushell.Container.getService("CrossApplicationNavigation").toExternal({
                            target: { semanticObject: "ZPMSEMORDERCREATE", action: "DISPLAY_V3" }
                        });
                    }
                }),
                endButton: new Button({
                    text: oI18n.getText("reponseNon"),
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        },

        /** Resets the SplitApp and master list in response to the Detail GoHome event. */
        _onGoHome: function () {
            var oSplitApp = this.getRouter()._findSplitApp(this.getView());
            if (oSplitApp) { oSplitApp.setMode(SplitAppMode.ShowHideMode); }
            this.getView().byId("list").getBinding("items").filter([]);
            this.getView().byId("list").setSelectedItem(null);
            this.getView().byId("listNav").getBinding("items").filter([]);
            var oState = this._getAppState();
            oState.setProperty("/logo", oState.getProperty("/homeLogo"));
            this._oEventBus.publish("Master", "ShowLogo");
            this._oEventBus.publish("Master", "clearPlan");
        },

        /** Initiates barcode scanning to find an equipment or functional location. */
        onScanCreate: function () {
            sap.ui.require(["sap/ndc/BarcodeScanner"], function (BarcodeScanner) {
                BarcodeScanner.scan(
                    this._onScanSuccess.bind(this),
                    this._onScanError.bind(this)
                );
            }.bind(this));
        },

        /** Processes a successful scan result and triggers create-order navigation. */
        _onScanSuccess: function (mResult) {
            if (mResult.cancelled || !mResult.text) {
                return;
            }
            this.getView().setBusy(true);
            var oSelf = this;
            // V2 callFunction API â€” return is ObjectData ComplexType, accessed directly
            this.getView().getModel().callFunction("/GET_TPLNR_OR_EQUNR", {
                method: "GET",
                urlParameters: { ObjectData: mResult.text },
                success: function (oData) {
                    oSelf.getView().setBusy(false);
                    // V2: ComplexType is returned directly (not nested under function name)
                    var oState = oSelf._getAppState();
                    oState.setProperty("/postName", oData.Tplnr || "");
                    oState.setProperty("/postDescription", oData.TplnrTxt || "");
                    oState.setProperty("/equipeName", oData.Equnr || "");
                    oState.setProperty("/equipeDescription", oData.EqunrTxt || "");

                    if (oData.Tplnr || oData.Equnr) {
                        oSelf.getOwnerComponent().getModel("functionalLocationData")
                            .setProperty("/Id", oData.Tplnr);
                        MessageToast.show("Redirection");
                        oSelf._oEventBus.publish("Master", "onCreateOrder");
                    } else {
                        MessageToast.show(
                            oSelf.getView().getModel("i18n").getResourceBundle()
                                .getText("noObjectIdentified"));
                    }
                },
                error: function () {
                    oSelf.getView().setBusy(false);
                    MessageToast.show(
                        oSelf.getView().getModel("i18n").getResourceBundle()
                            .getText("noObjectIdentified"));
                }
            });
        },

        /** Shows an error toast when the barcode scan fails. */
        _onScanError: function () {
            MessageToast.show(
                this.getView().getModel("i18n").getResourceBundle().getText("scanFailed"));
        },

        /** Returns the component-level shared application state model. */
        _getAppState: function () {
            var oComponent = this.getOwnerComponent();
            return oComponent ? oComponent.getModel("appState") : null;
        }

    });
});
