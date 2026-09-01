/*global QUnit, opaTest*/
sap.ui.require([
    "sap/ui/test/Opa5",
    "sap/ui/test/opaQunit",
    "sap/ui/test/actions/Press",
    "sap/ui/test/actions/EnterText",
    "sap/ui/test/matchers/Properties"
], function (Opa5, opaTest, Press, EnterText, Properties) {
    "use strict";

    var sComponentUrl = "../../index.html?responderOn=true";

    Opa5.extendConfig({
        timeout: 30,
        pollingInterval: 400,
        viewNamespace: "PO_CREATEORDER.view."
    });

    // ─── Arrangements ────────────────────────────────────────────────────────
    var oArrangements = new Opa5({
        iStartMyApp: function () {
            return this.iStartMyAppInAFrame(sComponentUrl);
        }
    });

    // ─── Actions ─────────────────────────────────────────────────────────────
    var oActions = new Opa5({
        iSearchForItem: function (sSearchText) {
            return this.waitFor({
                id: "searchField",
                viewName: "Master",
                actions: new EnterText({ text: sSearchText }),
                success: function () { QUnit.assert.ok(true, "Search field found and text entered"); },
                errorMessage: "Search field not found in Master view"
            });
        },
        iPressTheScanButton: function () {
            return this.waitFor({
                id: "btn_scan",
                viewName: "Master",
                actions: new Press(),
                success: function () { QUnit.assert.ok(true, "Scan button pressed"); },
                errorMessage: "Scan button not found in Master view"
            });
        },
        iPressCreateOrderButton: function () {
            return this.waitFor({
                id: "btn_createOrder",
                viewName: "Detail",
                actions: new Press(),
                success: function () { QUnit.assert.ok(true, "Create Order button pressed"); },
                errorMessage: "Create Order button not found in Detail view"
            });
        }
    });

    // ─── Assertions ──────────────────────────────────────────────────────────
    var oAssertions = new Opa5({
        theMasterListIsDisplayed: function () {
            return this.waitFor({
                id: "list",
                viewName: "Master",
                success: function (oList) {
                    QUnit.assert.ok(oList, "Master list is displayed");
                },
                errorMessage: "Master list not found"
            });
        },
        theSearchFieldIsVisible: function () {
            return this.waitFor({
                id: "searchField",
                viewName: "Master",
                success: function (oField) {
                    QUnit.assert.ok(oField.getVisible(), "Search field is visible");
                },
                errorMessage: "Search field not visible"
            });
        },
        theScanButtonIsEnabled: function () {
            return this.waitFor({
                id: "btn_scan",
                viewName: "Master",
                matchers: new Properties({ enabled: true }),
                success: function () { QUnit.assert.ok(true, "Scan button is enabled"); },
                errorMessage: "Scan button not enabled"
            });
        },
        theDetailPageIsDisplayed: function () {
            return this.waitFor({
                id: "detailPage",
                viewName: "Detail",
                success: function (oPage) {
                    QUnit.assert.ok(oPage, "Detail page is displayed");
                },
                errorMessage: "Detail page not found"
            });
        },
        theCreateOrderButtonIsVisible: function () {
            return this.waitFor({
                id: "btn_createOrder",
                viewName: "Detail",
                matchers: new Properties({ visible: true }),
                success: function () { QUnit.assert.ok(true, "Create Order button is visible"); },
                errorMessage: "Create Order button not visible"
            });
        }
    });

    // ─── Test Journeys ───────────────────────────────────────────────────────
    QUnit.module("Navigation — Master Page");

    opaTest("Master list loads and search is available", function (Given, When, Then) {
        Given.iStartMyApp();
        Then.theMasterListIsDisplayed();
        Then.theSearchFieldIsVisible();
        Then.theScanButtonIsEnabled();
    });

    QUnit.module("Navigation — Detail Page");

    opaTest("Detail page renders after app start", function (Given, When, Then) {
        Given.iStartMyApp();
        Then.theDetailPageIsDisplayed();
    });

    QUnit.module("Order Creation — Validation");

    opaTest("Create Order button is visible on canvas view", function (Given, When, Then) {
        Given.iStartMyApp();
        Then.theDetailPageIsDisplayed();
        Then.theCreateOrderButtonIsVisible();
    });

    Opa5.emptyQueue();

    // ─── Teardown ────────────────────────────────────────────────────────────
    QUnit.done(function () {
        Opa5.iTeardownMyApp();
    });
});
