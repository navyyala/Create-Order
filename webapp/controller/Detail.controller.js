sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/UIComponent",
    "sap/ui/core/Fragment",
    "sap/m/SplitAppMode",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/ColumnListItem",
    "sap/ui/core/format/DateFormat",
    "sap/ui/util/Storage"
], function (Controller, Filter, FilterOperator, JSONModel, UIComponent, Fragment,
             SplitAppMode, MessageBox, MessageToast, Dialog, Button, Text, ColumnListItem, DateFormat, Storage) {
    "use strict";

    return Controller.extend("PO_CREATEORDER.controller.Detail", {

        /** Initialises fragment IDs, models, event bus subscriptions, and canvas state. */
        onInit: function () {
            var oState = this._getAppState();

            // Reload component model instead of full page reload on FLP back-navigation
            if (oState.getProperty("/backFromFLP")) {
                oState.setProperty("/backFromFLP", false);
                this.getOwnerComponent().getModel().refresh(true);
            }

            this._oView = this.getView();
            this._oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            this._frgIdLogo = this._oView.getId() + "-logo";
            this._frgIdCanvas = this._oView.getId() + "-canvas";
            this._frgIdCreateOrder = this._oView.getId() + "-createOrder";
            this._frgIdEditItem = this._oView.getId() + "-addEditItem";
            this._frgIdaddEditItemDialog = this._oView.getId() + "-addEditItemDialog";
            this._itemsModel = new JSONModel();
            this._canvasEventsAdded = false;

            this.getRouter().attachRouteMatched(this._onRouteMatched, this);
            this.showLogo();

            this._oEventBus = this.getOwnerComponent().getEventBus();
            this._oEventBus.subscribe("Master", "ShowLogo", this.showLogo, this);
            this._oEventBus.subscribe("Master", "ShowCanvas", this.showCanvas, this);
            this._oEventBus.subscribe("Master", "clearPlan", this.clearPlan, this);
            this._oEventBus.subscribe("Master", "onCreateOrder", this.onCreateOrder, this);

            // Prevent swipe from revealing master panel inside detail page
            jQuery(window).on("swipe", function (e) { e.preventDefault(); });

            this.getView().setModel(new JSONModel({ imgVisible: true }), "createOrderViewModel");

            // Load home logo once via component model (avoids duplicate OData instance)
            this._loadHomeLogo();
        },

        /** Unsubscribes all event bus listeners on controller destruction. */
        onExit: function () {
            this._oEventBus.unsubscribe("Master", "ShowLogo", this.showLogo, this);
            this._oEventBus.unsubscribe("Master", "ShowCanvas", this.showCanvas, this);
            this._oEventBus.unsubscribe("Master", "clearPlan", this.clearPlan, this);
            this._oEventBus.unsubscribe("Master", "onCreateOrder", this.onCreateOrder, this);
        },

        /** Fetch the plant logo once and cache it in appState to avoid duplicate OData instances. */
        _loadHomeLogo: function () {
            var oSelf = this;
            this.getOwnerComponent().getModel().read("/PHOTOSet", {
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        var sLogo = oData.results[0].Base64.replace("application/octet-stream", "image/png");
                        var oState = oSelf._getAppState();
                        oState.setProperty("/homeLogo", sLogo);
                        oState.setProperty("/logo", sLogo);
                        if (Fragment.byId(oSelf._frgIdLogo, "img_logo")) {
                            Fragment.byId(oSelf._frgIdLogo, "img_logo").setSrc(sLogo);
                        }
                    }
                },
                error: function () {
                    // Logo load failure is non-critical â€” app continues without image
                }
            });
        },

        /** Hooks the plan image afterRendering callback to trigger canvas load. */
        onAfterRendering: function () {
            var oSelf = this;
            var oPlan = Fragment.byId(this._frgIdCanvas, "img_plan");
            if (oPlan) {
                oPlan.onAfterRendering = function () { oSelf.loadCanvas(); };
            }
        },

        /** Binds the view to the selected entity and initialises location-based state. */
        _onRouteMatched: function (oEvent) {
            if (oEvent.getParameters().name !== "detail") {
                return;
            }
            var sEntityPath = "/" + oEvent.getParameters().arguments.entity;
            this._oView.bindElement(sEntityPath);
            this._sEntityPath = sEntityPath;

            var oModel = this._oView.getModel();
            this._planUrl = oModel.getProperty(sEntityPath + "/PathLayout");
            this.getView().getModel("createOrderViewModel")
                .setProperty("/imgVisible", !!this._planUrl);

            this._objType = oModel.getProperty(sEntityPath + "/ObjType");
            var oState = this._getAppState();

            if (this._objType === "F") {
                oState.setProperty("/postName", oModel.getProperty(sEntityPath + "/Name") || "");
                oState.setProperty("/postDescription", oModel.getProperty(sEntityPath + "/Description") || "");
            }
            if (this._objType === "E") {
                oState.setProperty("/equipeName", oModel.getProperty(sEntityPath + "/Name") || "");
                oState.setProperty("/equipeDescription", oModel.getProperty(sEntityPath + "/Description") || "");

                var sEqunr = oState.getProperty("/equipeName");
                oModel.callFunction("/GET_FUNC_BY_EQU", {
                    method: "GET",
                    urlParameters: { Equnr: sEqunr },
                    success: function (oData) {
                        // FUNCLOC entity â€” Name property holds the functional location
                        oState.setProperty("/postName", oData.Name || "");
                        oState.setProperty("/postDescription", "");
                    },
                    error: function () {}
                });
            }
            this._getUploadToken();
        },

        /** Returns to the master list in ShowHide mode and resets the form. */
        onNavBack: function () {
            var oSplitApp = this.getRouter()._findSplitApp(this._oView);
            if (oSplitApp) { oSplitApp.setMode(SplitAppMode.ShowHideMode); }
            this._oEventBus.publish("Detail", "GoHome");
            this.onEffacer();
            this.clearAll();
        },

        /** Returns the component router. */
        getRouter: function () {
            return UIComponent.getRouterFor(this);
        },

        /** Resets all form controls, clears uploads, and removes the temp attachment. */
        clearAll: function () {
            var fById = function (sId) { return Fragment.byId(this._frgIdCreateOrder, sId); }.bind(this);

            ["cb_priority","cb_typeOrder","cb_centreTravail","cb_CatFail",
             "cb_FailCode","cb_CatCause","cb_CauseCode","cb_CatFunc","cb_FunCode"
            ].forEach(function (sId) {
                var oCtrl = fById(sId);
                if (oCtrl) { oCtrl.setSelectedKey(""); }
            });

            var oDesc = fById("headerDesc");
            if (oDesc) { oDesc.setValue(""); }
            var oUploads = fById("Uploads");
            if (oUploads) { oUploads.destroyItems(); }
            var oEquip = fById("txt_Equipement");
            if (oEquip) { oEquip.setText(""); }

            this.getOwnerComponent().getModel("orderEnableFields").setData({
                requestor: false, workType: false, groupCode: false
            });

            this.getOwnerComponent().getModel().remove(
                "/ATTACHSet(Aufnr='',Tplnr='',Equnr='',Doknr='')", { success: function () {}, error: function () {} }
            );
        },

        /** Warns when the breakdown start date is set in the future. */
        onDateChange: function () {
            var dateSel = Fragment.byId(this._frgIdCreateOrder, "breakdownstartdateid").getDateValue();
            if (dateSel > new Date()) {
                MessageBox.warning("Malfunction date entered is in the future");
            }
        },

        /** Shows the create-order form and hides the master panel. */
        onCreateOrder: function () {
            if (this._createOrderFragment) {
                this.clearAll();
            }
            var oModel = this._oView.getModel();
            oModel.create("/ATTACHSet", { Filename: "", Mimetype: "", Base64: "" }, { success: function () {}, error: function () {} });

            this._oView.setBusy(true);
            this.showCreateOrder();

            var oSplitApp = this.getRouter()._findSplitApp(this._oView);
            if (oSplitApp) {
                oSplitApp.setMode(SplitAppMode.HideMode);
                oSplitApp.hideMaster();
            }

            var oState = this._getAppState();
            var sPostName = oState.getProperty("/postName");
            var sEquipeName = oState.getProperty("/equipeName");

            var oUploads = Fragment.byId(this._frgIdCreateOrder, "Uploads");
            var oPlan = Fragment.byId(this._frgIdCreateOrder, "_imgPlan");
            Fragment.byId(this._frgIdCreateOrder, "headerDesc").setValue("");

            if (oPlan) {
                var oCanvas = document.getElementById(this._frgIdCanvas + "--canvas");
                if (oCanvas) {
                    this._dataURL = oCanvas.toDataURL();
                    oPlan.setSrc(this._dataURL);
                    if (this._canvasChanged) {
                        oModel.create("/PHOTOSet", {
                            Filename: "Plan.png", Mimetype: "image/png",
                            Base64: this._dataURL.split(",")[1]
                        }, { success: function () {}, error: function () {} });
                    }
                }
                var aFilters = [];
                if (sPostName) { aFilters.push(new Filter("Tplnr", FilterOperator.Contains, sPostName)); }
                if (sEquipeName) { aFilters.push(new Filter("Equnr", FilterOperator.Contains, sEquipeName)); }
                aFilters.push(new Filter("Dokar", FilterOperator.Contains, "ZDT"));
                if (oUploads && oUploads.getBinding("items")) {
                    oUploads.getBinding("items").filter(aFilters);
                }

                var oWorkCenter = Fragment.byId(this._frgIdCreateOrder, "cb_centreTravail");
                if (oWorkCenter && oWorkCenter.getBinding("items")) {
                    oWorkCenter.getBinding("items").filter([new Filter("Tplnr", FilterOperator.EQ, sPostName)]);
                    oWorkCenter.getBinding("items").attachEvent("dataReceived", function (oEvent) {
                        var aResults = (oEvent.getParameter("data") || {}).results || [];
                        var aMatch = aResults.filter(function (item) { return item.Tplnr === sPostName; });
                        if (aMatch.length > 0) {
                            Fragment.byId(this._frgIdCreateOrder, "cb_centreTravail").setSelectedKey(aMatch[0].Arbpl);
                        }
                    }.bind(this));
                }
            }

            // Set current date/time as breakdown start defaults
            var oNow = new Date();
            Fragment.byId(this._frgIdCreateOrder, "breakdownstartdateid").setDateValue(oNow);
            Fragment.byId(this._frgIdCreateOrder, "breakdownstarttimeid").setValue(
                this._pad(oNow.getHours()) + ":" + this._pad(oNow.getMinutes()) + ":" + this._pad(oNow.getSeconds())
            );

            var oTableOrders = Fragment.byId(this._frgIdCreateOrder, "tableOrders");
            if (oTableOrders) {
                oTableOrders.attachEvent("updateFinished", function () {
                    var oFilter = Fragment.byId(this._frgIdCreateOrder, "filterOpenOrders");
                    if (oFilter) { oFilter.setCount(oTableOrders.getItems().length); }
                }, this);
                var aOrderFilters = sPostName ? [new Filter("Tplnr", FilterOperator.Contains, sPostName)] : [];
                aOrderFilters.push(new Filter("Apptype", FilterOperator.Contains, "C"));
                if (oTableOrders.getBinding("items")) {
                    oTableOrders.getBinding("items").filter(aOrderFilters);
                }
            }

            var sPostDesc = oState.getProperty("/postDescription");
            var sEquipeDesc = oState.getProperty("/equipeDescription");
            if (sPostDesc) {
                Fragment.byId(this._frgIdCreateOrder, "txt_PosteTechniqe")
                    .setText(this._oResourceBundle.getText("messagePosteTechnique") + sPostDesc);
            }
            if (sEquipeDesc) {
                Fragment.byId(this._frgIdCreateOrder, "txt_Equipement")
                    .setText(this._oResourceBundle.getText("messageEquipement") + sEquipeDesc);
            }

            this._itemsData = [{ Vornr: "0010", Pernr: "", Description: "", Gewrk: "" }];
            this.refreshTableItems();
            var oTableItems = Fragment.byId(this._frgIdCreateOrder, "tableItems");
            if (oTableItems) {
                oTableItems.attachEvent("updateFinished", function () {
                    var oFilter = Fragment.byId(this._frgIdCreateOrder, "filterItems");
                    if (oFilter) { oFilter.setCount(oTableItems.getItems().length); }
                }.bind(this));
            }

            // Filter catalogues by functional location
            var sFuncLoc = (this._objType === "E")
                ? sPostName
                : this.getOwnerComponent().getModel("functionalLocationData").getProperty("/Id");

            ["cb_CatFunc", "cb_CatCause", "cb_CatFail"].forEach(function (sId) {
                var oCtrl = Fragment.byId(this._frgIdCreateOrder, sId);
                if (oCtrl && oCtrl.getBinding("items")) {
                    oCtrl.getBinding("items").filter([new Filter("Tplnr", FilterOperator.EQ, sFuncLoc)]);
                }
            }.bind(this));

            this._oView.setBusy(false);
        },

        /** Validates mandatory fields and posts the work order to the backend. */
        onSaveOrder: function () {
            var oSelf = this;
            this._oView.setBusy(true);

            var fById = function (sId) { return Fragment.byId(this._frgIdCreateOrder, sId); }.bind(this);

            var oSelPriority    = fById("cb_priority");
            var oSelTypeOrder   = fById("cb_typeOrder");
            var oSelWorkCenter  = fById("cb_centreTravail");
            var oSelWorkGroup   = fById("cb_CatFail");
            var oSelFailCode    = fById("cb_FailCode");
            var oSelFunction    = fById("cb_CatFunc");
            var oSelFunctionCode = fById("cb_FunCode");
            var oSelCause       = fById("cb_CatCause");
            var oSelCauseCode   = fById("cb_CauseCode");
            var oHeaderDesc     = fById("headerDesc");

            // Reset validation states
            [oSelPriority, oSelTypeOrder, oSelWorkGroup, oSelFunction,
             oSelFunctionCode, oSelCause, oSelCauseCode, oHeaderDesc
            ].forEach(function (o) { if (o) { o.setValueState("None"); } });

            // Mandatory field validation
            if (!oSelPriority.getSelectedKey()) {
                oSelPriority.setValueState("Error");
                MessageToast.show(this._oResourceBundle.getText("msgCheckPriority"));
                this._oView.setBusy(false);
                return;
            }
            if (!oSelTypeOrder.getSelectedKey()) {
                oSelTypeOrder.setValueState("Error");
                MessageToast.show(this._oResourceBundle.getText("msgCheckPriority"));
                this._oView.setBusy(false);
                return;
            }
            if (!oHeaderDesc.getValue()) {
                oHeaderDesc.setValueState("Error");
                MessageToast.show(this._oResourceBundle.getText("msgCheckDescription"));
                this._oView.setBusy(false);
                return;
            }

            // Validate all operations have a description
            var bMissingDesc = this._itemsData.some(function (oItem) { return !oItem.Description; });
            if (bMissingDesc) {
                this._oView.setBusy(false);
                return;
            }

            var oState = this._getAppState();
            var sAufart = oSelTypeOrder.getSelectedKey();
            this._itemsData[0].Gewrk = oSelWorkCenter && oSelWorkCenter.getSelectedItem()
                ? oSelWorkCenter.getSelectedItem().getKey() : "";

            var oHeader = {
                Aufnr: "",
                Aufart: sAufart,
                Tplnr: oState.getProperty("/postName"),
                Equnr: oState.getProperty("/equipeName"),
                Prior: oSelPriority.getSelectedKey(),
                Code: oSelFailCode && oSelFailCode.getSelectedItem() ? oSelFailCode.getSelectedItem().getKey() : "",
                Codegruppe: oSelWorkGroup && oSelWorkGroup.getSelectedItem() ? oSelWorkGroup.getSelectedItem().getKey() : "",
                Gewrk: this._itemsData[0].Gewrk,
                Description: oHeaderDesc.getValue(),
                PMOrderitems: this._itemsData,
                PMMessage: [],
                Function: oSelFunction && oSelFunction.getSelectedItem() ? oSelFunction.getSelectedItem().getKey() : "",
                FunctionCode: oSelFunctionCode && oSelFunctionCode.getSelectedItem() ? oSelFunctionCode.getSelectedItem().getKey() : "",
                Cause: oSelCause && oSelCause.getSelectedItem() ? oSelCause.getSelectedItem().getKey() : "",
                CauseCode: oSelCauseCode && oSelCauseCode.getSelectedItem() ? oSelCauseCode.getSelectedItem().getKey() : ""
            };

            if (sAufart === "ZM17") {
                var oDateVal = fById("breakdownstartdateid").getDateValue();
                oHeader.Ausvn = this._toODataDateTime(oDateVal);
                oHeader.Auztv = fById("breakdownstarttimeid")._getInputValue();
                oHeader.Notifdate = oHeader.Ausvn;
                oHeader.Notiftime = oHeader.Auztv;
            }
            // Set current date/time for ZM18/ZM19 notification dates
            if (sAufart === "ZM18" || sAufart === "ZM19") {
                var oNow = new Date();
                oHeader.Notifdate = this._toODataDateTime(oNow);
                oHeader.Notiftime = this._pad(oNow.getHours()) + ":" +
                    this._pad(oNow.getMinutes()) + ":" + this._pad(oNow.getSeconds());
            }

            this._oView.getModel().create("/ORDERHEADERSet", oHeader, {
                success: function (oData) {
                    oSelf._oView.setBusy(false);
                    if (oData.Aufnr) {
                        MessageBox.show(oSelf._oResourceBundle.getText("msgOrderCreated"), {
                            icon: MessageBox.Icon.SUCCESS,
                            title: oSelf._oResourceBundle.getText("textOrderNo") + oData.Aufnr,
                            actions: [MessageBox.Action.OK],
                            onClose: function () {
                                var oFields = oSelf.getOwnerComponent().getModel("orderEnableFields");
                                if (oFields.getProperty("/groupCode") && oFields.getProperty("/requestor")) {
                                    var sTechId = oSelf._itemsData.length > 0 ? oSelf._itemsData[0].Pernr : "00000000";
                                    oSelf._navToConfirmApp(oData.Aufnr, sTechId);
                                } else {
                                    oSelf.onNavBack();
                                }
                            }
                        });
                    } else {
                        var sMsg = oSelf._oResourceBundle.getText("textOrderCreateFailed");
                        var aMessages = (oData.PMMessage && oData.PMMessage.results) || [];
                        aMessages.forEach(function (m) { sMsg += "\n" + m.Message; });
                        MessageBox.show(sMsg, {
                            icon: MessageBox.Icon.ERROR,
                            title: "Message",
                            actions: [MessageBox.Action.OK]
                        });
                    }
                },
                error: function (oError) {
                    oSelf._oView.setBusy(false);
                    MessageBox.show(
                        oSelf._oResourceBundle.getText("textOrderCreateFailed"), {
                            icon: MessageBox.Icon.ERROR,
                            title: "Message",
                            actions: [MessageBox.Action.OK]
                        }
                    );
                }
            });
        },

        /** Formats a Date to yyyy-MM-ddT00:00:00 for OData V2. */
        _toODataDateTime: function (oDate) {
            var oFmt = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
            return oFmt.format(new Date(oDate)) + "T00:00:00";
        },

        /** Zero-pads a single-digit number to two characters. */
        _pad: function (n) { return n < 10 ? "0" + n : String(n); },

        /** Cross-app navigates to the order confirmation Fiori app. */
        _navToConfirmApp: function (sAufnr, sTechId) {
            var oStorage = new Storage(Storage.Type.session, "po_createorder");
            oStorage.put("from", "maintenance");

            var oCrossAppNav = sap.ushell.Container.getService("CrossApplicationNavigation");
            var sHash = oCrossAppNav.hrefForExternal({
                target: { semanticObject: "ZPMORDERCONF", action: "DISPLAY_V3" },
                params: { orderID: sAufnr, technician: sTechId }
            }) || "";
            oCrossAppNav.toExternal({ target: { shellHash: sHash } });
        },

        /** Prompts for confirmation then discards the create-order form. */
        onCancelOrder: function () {
            var oSelf = this;
            var oDialog = new Dialog({
                title: this._oResourceBundle.getText("titleOrderCancel"),
                type: "Message",
                content: new Text({ text: this._oResourceBundle.getText("textOrderCancel") }),
                beginButton: new Button({
                    text: this._oResourceBundle.getText("reponseOui"),
                    press: function () {
                        oDialog.close();
                        var oSplitApp = oSelf.getRouter()._findSplitApp(oSelf._oView);
                        if (oSplitApp) { oSplitApp.setMode(SplitAppMode.ShowHideMode); }
                        oSelf.showCanvas();
                        oSelf.onEffacer();
                        oSelf.clearAll();
                        oSelf.loadCanvas();
                    }
                }),
                endButton: new Button({
                    text: this._oResourceBundle.getText("reponseNon"),
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        },

        /** Saves the canvas drawing as a photo attachment and returns to the form. */
        onSaveCanvas: function () {
            var oCanvas = document.getElementById(this._frgIdCanvas + "--canvas");
            if (oCanvas) {
                var sDataUrl = oCanvas.toDataURL();
                this._oView.getModel().create("/PHOTOSet", {
                    Filename: "Photo.png", Mimetype: "image/png",
                    Base64: sDataUrl.split(",")[1]
                }, { success: function () {}, error: function () {} });
            }
            this.showCreateOrder();
            this.getView().getModel().refresh(true);
        },

        /** Returns to the create-order form without saving the drawing. */
        onCancelCanvas: function () { this.showCreateOrder(); },

        /** Captures a photo via the device camera and opens the canvas view. */
        onTakePhoto: function () {
            if (!navigator.camera) {
                MessageToast.show(this._oResourceBundle.getText("cameraNotAvailable") ||
                    "Camera not available in this environment.");
                return;
            }
            var oSelf = this;
            navigator.camera.getPicture(function (sResult) {
                oSelf._cameraPhoto = "data:image/png;base64," + sResult;
                oSelf.showCanvas("fromCamera");
            }, function (sError) {
                MessageToast.show(sError);
            }, { quality: 15, destinationType: navigator.camera.DestinationType.DATA_URL });
        },

        /** Switches the detail page to the plant logo view. */
        showLogo: function () {
            if (this._logoFragment) {
                var oPage = this._oView.byId("detailPage");
                if (oPage && oPage.getContent()[0] !== this._logoFragment) {
                    oPage.removeAllContent();
                    oPage.addContent(this._logoFragment);
                }
            }
            ["btn_createOrder","btn_saveOrder","btn_cancel",
             "btn_saveCanvas","btn_cancelCanvas","btn_takePhoto"
            ].forEach(function (sId) {
                var oBtn = this._oView.byId(sId);
                if (oBtn) { oBtn.setVisible(false); }
            }, this);

            var sLogo = this._getAppState().getProperty("/logo");
            if (sLogo && Fragment.byId(this._frgIdLogo, "img_logo")) {
                Fragment.byId(this._frgIdLogo, "img_logo").setSrc(sLogo);
                this._getAppState().setProperty("/logo", "");
            }
        },

        /** Switches the detail page to the drawing canvas, loading the plan image. */
        showCanvas: function (sFrom) {
            var oState = this._getAppState();
            var sLogoSrc = this._cameraPhoto || oState.getProperty("/logo");

            if (!this._planImage) {
                var oSelf = this;
                // Use sap/ui/core/HTML safely â€” src set via DOM property, not innerHTML
                sap.ui.require(["sap/ui/core/HTML"], function (HTML) {
                    oSelf._planImage = new HTML("planImage");
                    oSelf._planImage.attachAfterRendering(function () { oSelf.loadCanvas(); });
                    // Set content via setAttribute â€” avoids unsanitised innerHTML concatenation
                    var oImg = document.createElement("img");
                    oImg.setAttribute("id", "planImage-img");
                    oImg.setAttribute("style", "display:none");
                    oSelf._planImage.setContent(oImg.outerHTML);
                    oSelf._finishShowCanvas(sFrom, sLogoSrc, oState);
                });
                return;
            }
            this._finishShowCanvas(sFrom, sLogoSrc, oState);
        },

        /** Completes canvas rendering after the plan image HTML element is ready. */
        _finishShowCanvas: function (sFrom, sLogoSrc, oState) {
            // Update img src via DOM after rendering (XSS-safe â€” no innerHTML concatenation)
            var oImgEl = document.getElementById("planImage-img");
            if (oImgEl) { oImgEl.src = sLogoSrc || ""; }

            if (this._cameraPhoto) {
                this.loadCanvas();
                this._cameraPhoto = "";
            }

            if (!this._canvasFragment) {
                this._canvasFragment = sap.ui.xmlfragment(this._frgIdCanvas, "PO_CREATEORDER.view.fragment.canvas", this);
                this._oView.addDependent(this._canvasFragment);
                this._oView.byId("detailPage").removeAllContent();
                this._oView.byId("detailPage").addContent(this._canvasFragment);
                this._oView.byId("detailPage").addContent(this._planImage);
            } else {
                var oPage = this._oView.byId("detailPage");
                if (oPage && oPage.getContent()[0] !== this._canvasFragment) {
                    oPage.removeAllContent();
                    oPage.addContent(this._canvasFragment);
                    oPage.addContent(this._planImage);
                }
            }

            var bFromCamera = (sFrom === "fromCamera");
            var oButtonVis = {
                btn_createOrder: !bFromCamera,
                btn_saveOrder: false,
                btn_cancel: false,
                btn_saveCanvas: bFromCamera,
                btn_cancelCanvas: bFromCamera,
                btn_takePhoto: bFromCamera
            };
            Object.keys(oButtonVis).forEach(function (sId) {
                var oBtn = this._oView.byId(sId);
                if (oBtn) { oBtn.setVisible(oButtonVis[sId]); }
            }, this);

            var sOldLogo = oState.getProperty("/oldLogo");
            var sCurrentLogo = oState.getProperty("/logo");
            if (sCurrentLogo === sOldLogo) {
                this._oView.byId("detailPage").removeContent(this._planImage);
            } else {
                if (this._planImage) { this._planImage.rerender(); }
            }
            oState.setProperty("/oldLogo", sCurrentLogo);
        },

        /** Draws the plan image onto the HTML5 canvas and attaches drawing event handlers. */
        loadCanvas: function () {
            this._oView.setBusy(true);
            var oSelf = this;
            var planImage = document.getElementById("planImage-img");
            var oCanvas = document.getElementById(this._frgIdCanvas + "--canvas");
            if (oCanvas) {
                var ctx = oCanvas.getContext("2d");
                ctx.clearRect(0, 0, oCanvas.width, oCanvas.height);
                if (planImage && planImage.width !== 0) {
                    oCanvas.width = planImage.width;
                    oCanvas.height = planImage.height;
                    ctx.drawImage(planImage, 0, 0);
                    planImage.style.display = "none";
                }
                this._ratio = Fragment.byId(this._frgIdCanvas, "sliderCircle").getValue();
                if (!this._canvasEventsAdded) {
                    this._attachCanvasEvents(oCanvas, ctx);
                    this._canvasEventsAdded = true;
                }
            }
            this._oView.setBusy(false);
        },

        /** Registers mouse and touch pencil/circle drawing handlers on the canvas element. */
        _attachCanvasEvents: function (oCanvas, ctx) {
            var oSelf = this;
            var bMousePressed = false;
            var lastX, lastY;

            oCanvas.addEventListener("mousedown", function (e) {
                bMousePressed = true;
                var fRatio = e.target.clientWidth / e.target.width;
                var cx = e.offsetX / fRatio;
                var cy = e.offsetY / fRatio;
                if (oSelf._drawTool === "pencil") { lastX = cx; lastY = cy; }
                if (oSelf._drawTool === "circle") {
                    var r = oSelf._ratio / fRatio;
                    ctx.beginPath();
                    ctx.lineWidth = 2;
                    ctx.arc(cx, cy, r, 0, 2 * Math.PI, false);
                    ctx.strokeStyle = "red";
                    ctx.stroke();
                    ctx.closePath();
                    oSelf._canvasChanged = true;
                }
            });
            oCanvas.addEventListener("mousemove", function (e) {
                if (!bMousePressed || oSelf._drawTool !== "pencil") { return; }
                var fRatio = e.target.clientWidth / e.target.width;
                var cx = e.offsetX / fRatio;
                var cy = e.offsetY / fRatio;
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(cx, cy);
                ctx.strokeStyle = "red";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.closePath();
                lastX = cx; lastY = cy;
                oSelf._canvasChanged = true;
            });
            oCanvas.addEventListener("mouseup", function () { bMousePressed = false; });
            oCanvas.addEventListener("mouseleave", function () { bMousePressed = false; });

            // Touch support for mobile
            oCanvas.addEventListener("touchstart", function (e) {
                e.preventDefault();
                var oTouch = e.touches[0];
                var fRatio = e.target.clientWidth / e.target.width;
                lastX = (oTouch.clientX - e.target.getBoundingClientRect().left) / fRatio;
                lastY = (oTouch.clientY - e.target.getBoundingClientRect().top) / fRatio;
            }, { passive: false });
            oCanvas.addEventListener("touchmove", function (e) {
                e.preventDefault();
                if (oSelf._drawTool !== "pencil") { return; }
                var oTouch = e.touches[0];
                var fRatio = e.target.clientWidth / e.target.width;
                var cx = (oTouch.clientX - e.target.getBoundingClientRect().left) / fRatio;
                var cy = (oTouch.clientY - e.target.getBoundingClientRect().top) / fRatio;
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(cx, cy);
                ctx.strokeStyle = "red";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.closePath();
                lastX = cx; lastY = cy;
                oSelf._canvasChanged = true;
            }, { passive: false });
        },

        /** Clears all drawings from the canvas. */
        onEffacer: function () {
            var oCanvas = document.getElementById(this._frgIdCanvas + "--canvas");
            if (oCanvas) {
                var ctx = oCanvas.getContext("2d");
                ctx.clearRect(0, 0, oCanvas.width, oCanvas.height);
            }
            this._canvasChanged = false;
        },

        /** Sets the active drawing tool to pencil. */
        onPencil: function () { this._drawTool = "pencil"; },
        /** Sets the active drawing tool to circle stamp. */
        onCircle: function () { this._drawTool = "circle"; },
        /** Updates the circle stamp radius from the slider value. */
        sliderCircleChanged: function (oEvent) { this._ratio = oEvent.getParameter("value"); },

        /** Resets the plan drawing to the cached home logo. */
        clearPlan: function () {
            this._canvasChanged = false;
            this._getAppState().setProperty("/logo", this._getAppState().getProperty("/homeLogo"));
        },

        /** Loads and displays the create-order and operations fragments in the detail page. */
        showCreateOrder: function () {
            if (!this._createOrderFragment) {
                this._createOrderFragment = sap.ui.xmlfragment(
                    this._frgIdCreateOrder, "PO_CREATEORDER.view.fragment.createOrder", this);
                // both fragments share the same ID prefix so Fragment.byId(frgIdCreateOrder,...) resolves controls from either
                this._modifyOperationFragment = sap.ui.xmlfragment(
                    this._frgIdCreateOrder, "PO_CREATEORDER.view.fragment.modifyOperation", this);
                this._oView.addDependent(this._createOrderFragment);
                this._oView.addDependent(this._modifyOperationFragment);
            }
            var oPage = this._oView.byId("detailPage");
            if (oPage && oPage.getContent()[0] !== this._createOrderFragment) {
                oPage.removeAllContent();
                oPage.addContent(this._createOrderFragment);
                oPage.addContent(this._modifyOperationFragment);
            }
            var oButtonVis = {
                btn_saveOrder: true, btn_cancel: true, btn_createOrder: false,
                btn_saveCanvas: false, btn_cancelCanvas: false, btn_takePhoto: false
            };
            Object.keys(oButtonVis).forEach(function (sId) {
                var oBtn = this._oView.byId(sId);
                if (oBtn) { oBtn.setVisible(oButtonVis[sId]); }
            }, this);
        },

        /** Rebuilds the activities table binding and template from the current items data. */
        refreshTableItems: function () {
            var oTableItems = Fragment.byId(this._frgIdCreateOrder, "tableItems");
            if (!oTableItems) { return; }
            this._itemsModel.setData({ jsonItems: this._itemsData });
            oTableItems.setModel(this._itemsModel);
            var oTemplate = new ColumnListItem({
                cells: [
                    new Text({ text: "{Vornr}" }),
                    new Text({ text: "{Gewrk}" }),
                    new Text({ text: "{Ename}" }),
                    new Text({ text: "{Description}" }),
                    new Button({ icon: "sap-icon://edit",   press: [this.onAddEditItem, this] }),
                    new Button({ icon: "sap-icon://delete", press: [this.onDeleteItem, this] })
                ]
            });
            oTableItems.bindItems("/jsonItems", oTemplate);
        },

        /** Opens the add/edit item dialog, pre-populated with row data in edit mode. */
        onAddEditItem: function (oEvent) {
            if (!this._addEditItemDialog) {
                this._addEditItemDialog = sap.ui.xmlfragment(
                    this._frgIdaddEditItemDialog, "PO_CREATEORDER.view.fragment.addEditItem", this);
                this._oView.addDependent(this._addEditItemDialog);
            }

            // Pre-filter workcenter list by functional location
            var sPostName = this._getAppState().getProperty("/postName");
            var oWcCb = Fragment.byId(this._frgIdaddEditItemDialog, "cb_workcenter");
            if (oWcCb && oWcCb.getBinding("items")) {
                oWcCb.getBinding("items").filter([new Filter("Tplnr", FilterOperator.EQ, sPostName)]);
            }

            // Default work center from main form
            var oMainWc = Fragment.byId(this._frgIdCreateOrder, "cb_centreTravail");
            var sWcRef = oMainWc ? oMainWc.getSelectedKey() : "";

            // Edit mode: detect if called from the row edit button (not the Add button)
            var oSource = oEvent.getSource();
            var bAddMode = !oSource.getParent || !oSource.getParent() ||
                !oSource.getParent().getCells;
            this._tmpItemNo = null;

            if (!bAddMode) {
                try {
                    var sItemNo = oSource.getParent().getCells()[0].getText();
                    for (var i = 0; i < this._itemsData.length; i++) {
                        if (this._itemsData[i].Vornr === sItemNo) {
                            var oItem = this._itemsData[i];
                            var oIntCb = Fragment.byId(this._frgIdaddEditItemDialog, "cb_intervenant");
                            var oWc    = Fragment.byId(this._frgIdaddEditItemDialog, "cb_workcenter");
                            var oDesc  = Fragment.byId(this._frgIdaddEditItemDialog, "itemDesc");
                            if (oWc)   { oWc.setSelectedKey(oItem.Gewrk || sWcRef); }
                            if (oIntCb){ oIntCb.setSelectedKey(oItem.Pernr || ""); oIntCb.setEnabled(!!oItem.Gewrk); }
                            if (oDesc) { oDesc.setValue(oItem.Description || ""); }
                            this._tmpItemNo = sItemNo;
                            break;
                        }
                    }
                } catch (e) { /* add mode fallback */ }
            }

            if (!this._tmpItemNo) {
                // Add mode — reset dialog fields
                var oWcA   = Fragment.byId(this._frgIdaddEditItemDialog, "cb_workcenter");
                var oIntA  = Fragment.byId(this._frgIdaddEditItemDialog, "cb_intervenant");
                var oDescA = Fragment.byId(this._frgIdaddEditItemDialog, "itemDesc");
                if (oWcA)  { oWcA.setSelectedKey(sWcRef); }
                if (oIntA) { oIntA.setSelectedKey(""); oIntA.setEnabled(!!sWcRef); }
                if (oDescA){ oDescA.setValue(""); }
            }

            this._addEditItemDialog.open();
        },

        /** Validates and persists an operation item then refreshes the activities table. */
        saveItem: function () {
            var fDlg = function (sId) { return Fragment.byId(this._frgIdaddEditItemDialog, sId); }.bind(this);
            var oDescCtrl = fDlg("itemDesc");
            oDescCtrl.setValueState("None");

            var sDesc = oDescCtrl.getValue();
            if (!sDesc) {
                oDescCtrl.setValueState("Error");
                return;
            }

            var sWc   = fDlg("cb_workcenter").getSelectedKey();
            var oIntCb = fDlg("cb_intervenant");
            var sPernr = oIntCb ? oIntCb.getSelectedKey() : "";
            var sEname = (oIntCb && oIntCb.getSelectedItem()) ? oIntCb.getSelectedItem().getText() : "";

            if (this._tmpItemNo) {
                // Edit mode — update existing item
                for (var i = 0; i < this._itemsData.length; i++) {
                    if (this._itemsData[i].Vornr === this._tmpItemNo) {
                        this._itemsData[i].Gewrk       = sWc;
                        this._itemsData[i].Pernr        = sPernr;
                        this._itemsData[i].Ename        = sEname;
                        this._itemsData[i].Description  = sDesc;
                        break;
                    }
                }
            } else {
                // Add mode — generate next Vornr
                var oLast   = this._itemsData[this._itemsData.length - 1] || { Vornr: "0000" };
                var sNextNo = "00" + (parseInt(oLast.Vornr, 10) + 10);
                this._itemsData.push({
                    Vornr:       sNextNo.slice(-4),
                    Gewrk:       sWc,
                    Pernr:       sPernr,
                    Ename:       sEname,
                    Description: sDesc
                });
            }

            this.closeDialog();
            this.refreshTableItems();
        },

        /** Resets dialog validation state and closes the add/edit item dialog. */
        closeDialog: function () {
            var oDesc = Fragment.byId(this._frgIdaddEditItemDialog, "itemDesc");
            if (oDesc) { oDesc.setValueState("None"); }
            this._tmpItemNo = null;
            if (this._addEditItemDialog) { this._addEditItemDialog.close(); }
        },

        /** Enables and filters the intervenant list when the work center selection changes. */
        onFrgWorkCenterChange: function (oEvent) {
            var oSelected = oEvent.getSource().getSelectedItem();
            var sArbpl = oSelected ? oSelected.getKey() : "";
            var oIntervenantCb = Fragment.byId(this._frgIdaddEditItemDialog, "cb_intervenant");
            if (oIntervenantCb) {
                oIntervenantCb.setEnabled(!!sArbpl);
                if (sArbpl) {
                    oIntervenantCb.getBinding("items").filter(
                        [new Filter("Arbpl", FilterOperator.EQ, sArbpl)]
                    );
                }
            }
        },

        /** Enables catalogue combos and toggles breakdown date fields for the selected order type. */
        onOrderSelected: function (oEvent) {
            var sAuart = oEvent.getSource().getSelectedKey();
            var bBreakdown = (sAuart === "ZM17");
            ["vboxstartdateid", "vboxstarttimeid"].forEach(function (sId) {
                var oCtrl = Fragment.byId(this._frgIdCreateOrder, sId);
                if (oCtrl) { oCtrl.setVisible(bBreakdown); }
            }.bind(this));
            ["cb_CatFunc", "cb_CatCause", "cb_CatFail"].forEach(function (sId) {
                var oCtrl = Fragment.byId(this._frgIdCreateOrder, sId);
                if (oCtrl) { oCtrl.setEnabled(true); }
            }.bind(this));
            this._applyWOBusinessRules(sAuart);
        },

        /** Loads and applies work-order business rules for the selected order type. */
        _applyWOBusinessRules: function (sAuart) {
            var oSelf = this;
            this.getOwnerComponent().getModel().read("/WO_RULESSet", {
                success: function (oData) {
                    var aRules = (oData.results || []).filter(function (r) { return r.ActType === sAuart; });
                    if (aRules.length > 0) {
                        var oRule = aRules[0];
                        oSelf.getOwnerComponent().getModel("orderEnableFields").setData({
                            requestor: oRule.Requestor === "X",
                            workType: oRule.WorkType === "X",
                            groupCode: oRule.GroupCode === "X"
                        });
                    }
                },
                error: function () {}
            });
        },

        /** Enables and filters the failure code combobox when the failure catalogue changes. */
        onFailureCatChange: function (oEvent) {
            var sCatKey = oEvent.getSource().getSelectedKey();
            var oFailCodeCb = Fragment.byId(this._frgIdCreateOrder, "cb_FailCode");
            if (oFailCodeCb) {
                oFailCodeCb.setEnabled(!!sCatKey);
                if (sCatKey) {
                    oFailCodeCb.getBinding("items").filter(
                        [new Filter("Codegruppe", FilterOperator.EQ, sCatKey)]
                    );
                }
            }
        },

        /** Enables and filters the function code combobox when the function catalogue changes. */
        onFunctionCatChange: function (oEvent) {
            var sCatKey = oEvent.getSource().getSelectedKey();
            var oFunCodeCb = Fragment.byId(this._frgIdCreateOrder, "cb_FunCode");
            if (oFunCodeCb) {
                oFunCodeCb.setEnabled(!!sCatKey);
                if (sCatKey && oFunCodeCb.getBinding("items")) {
                    oFunCodeCb.getBinding("items").filter(
                        [new Filter("Codegruppe", FilterOperator.EQ, sCatKey)]
                    );
                }
            }
        },

        /** Enables and filters the cause code combobox when the cause catalogue changes. */
        onCauseCatChange: function (oEvent) {
            var sCatKey = oEvent.getSource().getSelectedKey();
            var oCauseCodeCb = Fragment.byId(this._frgIdCreateOrder, "cb_CauseCode");
            if (oCauseCodeCb) {
                oCauseCodeCb.setSelectedKey("");
                oCauseCodeCb.setEnabled(!!sCatKey);
                if (sCatKey && oCauseCodeCb.getBinding("items")) {
                    oCauseCodeCb.getBinding("items").filter(
                        [new Filter("Codegruppe", FilterOperator.EQ, sCatKey)]
                    );
                }
            }
        },

        /** Placeholder for work-request combobox selection. */
        comboWRSelected: function () {},

        /** Enables and filters the intervenant list on the main form when work center changes. */
        onSelectWorkCenter: function (oEvent) {
            var sArbpl = oEvent.getSource().getSelectedKey();
            var oIntervenantCb = Fragment.byId(this._frgIdCreateOrder, "cb_intervenant");
            if (oIntervenantCb && sArbpl) {
                oIntervenantCb.setEnabled(true);
                oIntervenantCb.getBinding("items").filter(
                    [new Filter("Arbpl", FilterOperator.EQ, sArbpl)]
                );
            }
        },

        /** Placeholder for breakdown start time input handler. */
        onTimeChange: function () {},

        /** Opens the plan image in a full-size dialog when the image is visible. */
        imgPlanPressed: function () {
            if (this.getView().getModel("createOrderViewModel").getProperty("/imgVisible")) {
                var oSelf = this;
                var oDialog = new Dialog({
                    title: "Plan",
                    content: new sap.m.Image({ src: this._dataURL }),
                    beginButton: new Button({
                        text: this._oResourceBundle.getText("btnClose"),
                        press: function () { oDialog.close(); }
                    }),
                    afterClose: function () { oDialog.destroy(); }
                });
                this.getView().addDependent(oDialog);
                oDialog.open();
            }
        },

        /** Removes the selected operation row from the items data and refreshes the table. */
        onDeleteItem: function (oEvent) {
            var sItemNo = oEvent.getSource().getParent().getCells()[0].getText();
            this._itemsData = this._itemsData.filter(function (o) { return o.Vornr !== sItemNo; });
            this.refreshTableItems();
        },

        /** Shows an error toast if the upload failed and refreshes the model. */
        onUploadComplete: function (oEvent) {
            var iStatus = oEvent.getParameter("status");
            if (iStatus !== 200 && iStatus !== 201) {
                MessageToast.show(this._oResourceBundle.getText("fileTypeNotSupported"));
            }
            this.getView().getModel().refresh(true);
        },

        /** Placeholder for upload pre-processing — overridden by UploadCollection events. */
        onBeforeUploadStarts: function () {},

        /** Attaches CSRF token and filename slug headers before the file upload starts. */
        onChange: function (oEvent) {
            var sap_m = sap.m; // avoid minifier issues
            var oToken = new sap_m.UploadCollectionParameter({ name: "x-csrf-token", value: this._token || "" });
            var oSlug  = new sap_m.UploadCollectionParameter({ name: "slug", value: oEvent.getParameter("files")[0].name });
            oEvent.getSource().addHeaderParameter(oToken);
            oEvent.getSource().addHeaderParameter(oSlug);
        },

        /** Removes the deleted attachment entry from the backend. */
        onFileDeleted: function (oEvent) {
            var sDocId = oEvent.getParameter("documentId");
            this.getView().getModel().remove(
                "/ATTACHSet(Aufnr='',Tplnr='',Equnr='',Doknr='" + sDocId + "')",
                { success: function () {}, error: function () {} }
            );
            this.getView().getModel().refresh(true);
        },

        /** Syncs the first 40 characters of the description to the first operation item. */
        textAreaChanged: function (oEvent) {
            var sText = oEvent.getSource().getValue();
            if (this._itemsData && this._itemsData.length > 0) {
                this._itemsData[0].Description = sText.substring(0, 40);
            }
        },

        /** Refreshes the CSRF token and stores it for subsequent upload requests. */
        _getUploadToken: function () {
            var oSelf = this;
            this.getOwnerComponent().getModel().refreshSecurityToken(function () {
                oSelf._token = oSelf.getOwnerComponent().getModel().getSecurityToken();
            });
        },

        /** Returns the component-level shared application state model. */
        _getAppState: function () {
            var oComponent = this.getOwnerComponent();
            return oComponent ? oComponent.getModel("appState") : null;
        }

    });
});
