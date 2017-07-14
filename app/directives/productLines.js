MetronicApp.directive('productLines', ['$http',
    function($http) {
        return {
            restrict: 'E',
            require: 'ngModel',
            scope: {
                linesModel: '=ngModel',
                title: '=',
                priceList: "=",
                forSales: "=",
                supplier: "=",
                warehouse: "=",
                ngTemplate: "@",
                editable: '=ngDisabled',
                ngChange: '&'
            },
            templateUrl: function(el, attr) {
                //console.log(attr);

                if (attr.ngTemplate)
                    return attr.ngTemplate;

                if (attr.forSales == "false")
                    return '/templates/core/productSupplierLine.html';
                return '/templates/core/productLine.html';
            },
            link: function(scope, elem, attrs, ngModel) {

                //console.log(scope);

                $http({
                    method: 'GET',
                    url: '/erp/api/product/taxes'
                }).success(function(data, status) {
                    //console.log(data);
                    scope.taxes = data.data;
                });

                if (scope.warehouse)
                    $http({
                        method: 'GET',
                        url: '/erp/api/product/warehouse/location/select',
                        params: { warehouse: scope.warehouse._id }
                    }).success(function(data, status) {
                        //console.log(data);
                        scope.locations = data.data;
                    });

                scope.checkLine = function(data) {
                    //console.log(data);
                    if (!data)
                        return "La ligne produit ne peut pas être vide";
                    if (!data._id)
                        return "Le produit n'existe pas";
                };

                scope.addProduct = function(data, index, lines) {
                    console.log("addProduct ", data);
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].idLine === index) {
                            lines[i] = {
                                //type: 'product',
                                pu_ht: data.prices.price,
                                total_taxes: data.taxes,
                                discount: data.discount,
                                priceSpecific: ((data.dynForm || scope.forSales == false) ? true : false),
                                product: {
                                    _id: data._id,
                                    info: data.info,
                                    taxes: data.taxes,
                                    unit: data.units,
                                    dynForm: data.dynForm
                                        //family: data.product.id.caFamily
                                },
                                description: (lines[i].description ? lines[i].description : data.info.langs[0].description),
                                isNew: true,
                                qty: lines[i].qty,
                                //qty_order: lines[i].qty_order, // qty from order
                                //weight: data.info.weight,
                                idLine: index
                            };

                            if (scope.forSales == false && data.suppliers && data.suppliers.length) {
                                lines[i].refProductSupplier = data.suppliers[0].ref;
                                lines[i].pu_ht = data.suppliers[0].prices.pu_ht;
                                lines[i].qty = data.suppliers[0].minQty;
                            }

                            //console.log(lines[i]);
                            scope.calculMontantHT(lines[i]);
                        }
                    }
                };
                var round = function(value, decimals) {
                    if (value > Math.pow(10, (decimals + 2) * -1) * -1 && value < Math.pow(10, (decimals + 2) * -1)) // Fix error little number
                        return 0;
                    return Number(Math.round(value + 'e' + (decimals)) + 'e-' + (decimals));
                };

                scope.calculMontantHT = function(line, data, varname) {
                    if (varname)
                        line[varname] = data;

                    function calculHT(line) {
                        if (line.qty) {
                            line.total_ht = round(line.qty * (line.pu_ht * (1 - (line.discount / 100))), 2);
                            //line.total_tva = line.total_ht * line.tva_tx / 100;
                        } else {
                            line.total_ht = 0;
                            //line.total_tva = 0;
                        }

                        //Refresh inventory
                        if (!line.product.info.productType.inventory)
                            return;

                        $http({
                            method: 'GET',
                            url: '/erp/api/product/warehouse/getAvailability',
                            params: { warehouse: scope.warehouse, product: line.product._id }
                        }).success(function(data, status) {
                            line.onHand = data.onHand;
                        });
                    }

                    if (line.qty && line.product && line.product._id && !line.priceSpecific)
                        return $http.post('/erp/api/product/price', {
                            priceLists: scope.priceList,
                            qty: line.qty,
                            product: line.product._id
                        }).then(function(res) {
                            //console.log(res.data);
                            line.pu_ht = res.data.pu_ht;
                            if (res.data.discount)
                                line.discount = res.data.discount;

                            //return res.data;
                            calculHT(line);
                        });

                    calculHT(line);
                };


                scope.productAutoComplete = function(val) {
                    return $http.post('/erp/api/product/autocomplete', {
                        take: 20,
                        skip: 0,
                        page: 1,
                        pageSize: 5,
                        priceList: scope.priceList,
                        forSales: scope.forSales,
                        supplier: scope.supplier,
                        filter: {
                            logic: 'and',
                            filters: [{
                                value: val
                            }]
                        }
                    }).then(function(res) {
                        console.log(res.data);
                        return res.data;
                    });
                };


                // filter lines to show
                scope.filterLine = function(line) {
                    return line.isDeleted !== true;
                };
                scope.editLine = function(row, index, lines) {
                    this.tableform.$save();
                    var self = this;
                    var modalInstance = $modal.open({
                        templateUrl: '/templates/dynforms/productline.html',
                        controller: "DynFormController",
                        size: "lg",
                        resolve: {
                            object: function() {
                                return row;
                            },
                            options: function() {
                                return {
                                    priceList: scope.priceList
                                };
                            }
                        }
                    });
                    modalInstance.result.then(function(line) {
                        scope.linesModel[index] = line;
                        scope.calculMontantHT(scope.linesModel[index]);
                        self.tableform.$show();
                    }, function() {});
                };
                // add line
                scope.addLine = function(lines) {
                    lines.push({
                        isNew: true,
                        idLine: lines.length
                    });
                };
                // mark line as deleted
                scope.deleteLine = function(line) {
                    line.isDeleted = true;
                };
                // Duplicate a line
                scope.copyLine = function(line, lines) {

                    var new_line = _.clone(line);
                    delete new_line._id;
                    delete new_line.id;
                    delete new_line['$$hashKey'];
                    new_line.isNew = true;
                    new_line.idLine = lines.length;

                    lines.push(new_line);
                };

                scope.AddSubTotal = function(index) {
                    scope.linesModel.splice(index + 1, 0, {
                        pu_ht: null,
                        tva_tx: null,
                        discount: null,
                        type: 'SUBTOTAL',
                        product: null,
                        description: "",
                        isNew: true,
                        qty: null
                    });

                    for (var i in scope.linesModel.lines) {
                        scope.linesModel.lines[i].idLine = i;
                    }
                };


                // up or down a line
                scope.upDownLine = function(id, mode, lines) {
                    //id = parseInt(id);
                    var elem = lines[id];
                    if (mode == 'UP') {
                        lines[id] = lines[id - 1];
                        lines[id - 1] = elem;
                    } else {
                        lines[id] = lines[id + 1];
                        lines[id + 1] = elem;
                    }
                    scope.update();
                };

                scope.update = function() {
                    //console.log("save");
                    ngModel.$setViewValue(scope.linesModel);

                    scope.ngChange();

                    return true;
                };
            }
        };
    }
]);

MetronicApp.directive('productStockLines', ['$http',
    function($http) {
        return {
            restrict: 'E',
            require: 'ngModel',
            scope: {
                linesModel: '=ngModel',
                title: '=',
                warehouse: "=",
                location: "=",
                ngTemplate: "@",
                editable: '=ngDisabled',
                ngChange: '&'
            },
            templateUrl: function(el, attr) {
                console.log(attr);

                if (attr.ngTemplate)
                    return attr.ngTemplate;

                return '/templates/core/productStockCorrection.html';
            },
            link: function(scope, elem, attrs, ngModel) {

                console.log(scope);

                scope.checkLine = function(data) {
                    //console.log(data);
                    if (!data)
                        return "La ligne produit ne peut pas être vide";
                    if (!data._id)
                        return "Le produit n'existe pas";
                };

                scope.addProduct = function(data, index, lines) {
                    console.log("addProduct ", data);
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].idLine === index) {
                            lines[i] = {
                                locationsReceived: [],
                                cost: data.directCost,
                                orderRowId: null,
                                newOnHand: 0,

                                //type: 'product',
                                product: {
                                    _id: data._id,
                                    info: data.info,
                                    unit: data.units,
                                },
                                isNew: true,
                                qty: lines[i].qty || 0,
                                idLine: index
                            };

                            //console.log(lines[i]);
                            scope.getAvailable(lines, i);
                        }
                    }
                };

                scope.getAvailable = function(lines, i) {
                    $http({
                        method: 'GET',
                        url: '/erp/api/product/warehouse/getAvailability',
                        params: { location: scope.location._id, product: lines[i].product._id }
                    }).success(function(data, status) {
                        console.log(data);

                        lines[i] = angular.extend(lines[i], { onHand: data.onHand || 0, newOnHand: data.onHand || 0 });
                    });
                };

                scope.updateQty = function(line, field) {
                    if (field == 'qty')
                        line.newOnHand = line.onHand + line.qty;
                    else
                        line.qty = line.newOnHand - line.onHand;
                };

                scope.productAutoComplete = function(val) {
                    return $http.post('/erp/api/product/autocomplete', {
                        take: 20,
                        skip: 0,
                        page: 1,
                        pageSize: 5,
                        priceList: scope.priceList,
                        forSales: scope.forSales,
                        supplier: scope.supplier,
                        filter: {
                            logic: 'and',
                            filters: [{
                                value: val
                            }]
                        }
                    }).then(function(res) {
                        console.log(res.data);
                        return res.data;
                    });
                };


                // filter lines to show
                scope.filterLine = function(line) {
                    return line.isDeleted !== true;
                };

                // add line
                scope.addLine = function(lines) {
                    if (!scope.location || !scope.location._id)
                        return;

                    lines.push({
                        isNew: true,
                        idLine: lines.length
                    });
                };
                // mark line as deleted
                scope.deleteLine = function(line) {
                    line.isDeleted = true;
                };
            }
        };
    }
]);