// MyRouter.js — retained as a backward-compatibility shim.
// Routing is now declared in manifest.json (sap.m.routing.Router).
// The myNavToWithoutHash helper is preserved for Detail.controller usage.
sap.ui.define([
    "sap/m/routing/Router",
    "sap/ui/core/routing/History"
], function (Router, History) {
    "use strict";

    return Router.extend("PO_CREATEORDER.MyRouter", {

        /** Navigates back via browser history or falls back to a named route. */
        myNavBack: function (sRoute, mData) {
            var sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.navTo(sRoute, mData, true);
            }
        },

        /** Navigate without changing the URL hash (used for SplitApp page transitions). */
        myNavToWithoutHash: function (oOptions) {
            var oSplitApp = this._findSplitApp(oOptions.currentView);
            var oView = this.getView(oOptions.targetViewName, oOptions.targetViewType);
            oSplitApp.addPage(oView, oOptions.isMaster);
            oSplitApp.to(oView.getId(), oOptions.transition || "show", oOptions.data);
        },

        /** Navigates back in the master or detail panel without changing the URL hash. */
        backWithoutHash: function (oCurrentView, bIsMaster) {
            var sBackMethod = bIsMaster ? "backMaster" : "backDetail";
            this._findSplitApp(oCurrentView)[sBackMethod]();
        },

        /** Delegates to the parent Router destroy method. */
        destroy: function () {
            Router.prototype.destroy.apply(this, arguments);
        },

        /** Traverses the ancestor control chain to locate the SplitApp. */
        _findSplitApp: function (oControl) {
            var sAncestorControlName = "idAppControl";
            if (oControl instanceof sap.ui.core.mvc.View && oControl.byId(sAncestorControlName)) {
                return oControl.byId(sAncestorControlName);
            }
            return oControl.getParent() ? this._findSplitApp(oControl.getParent()) : null;
        }
    });
});