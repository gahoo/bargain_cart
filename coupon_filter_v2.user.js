// ==UserScript==
// @name         coupon_filter_v2
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Filter items and recommend bargains in JD cart.
// @author       Gahoo & Gemini
// @match        https://cart.jd.com/cart_index*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    // --- 模块化代码结构 ---

    // --- 数据模型定义 ---
    class Sku {
        constructor(id, name, price, quantity) {
            this.id = id;
            this.name = name;
            this.price = price;
            this.quantity = quantity;
            this.element = null; // DOM element reference
            this.coupons = [];
            this.promotions = [];
        }
    }

    class Coupon {
        constructor(id, title, discount, quota, iconStyle, plusStyle, beginTime, endTime, overLap) {
            this.id = id;
            this.title = title;
            this.discount = discount;
            this.quota = quota;
            this.couponIconStyle = iconStyle;
            this.plusStyle = plusStyle;
            this.beginTime = beginTime;
            this.endTime = endTime;
            this.overLap = overLap;
            this.element = null; // DOM element reference
            this.skus = [];
        }
    }

    class Promotion {
        constructor(id, title, STip, suitType, suitLabel) {
            this.id = id;
            this.title = title;
            this.STip = STip;
            this.suitType = suitType;
            this.suitLabel = suitLabel;
            this.element = null; // DOM element reference
            this.skus = [];
        }
    }

    class Plan {
        constructor(id) {
            this.id = id;
            this.skus = [];
            this.coupons = [];
            this.promotions = [];
            this.total_price = 0;
            this.real_price = 0;
            this.element = null; // DOM element reference
        }
    }

    class Cart {
        constructor() {
            this.skus = [];
            this.coupons = [];
            this.promotions = [];
            this.plans = [];
            this.selected_skus = [];
            this.selected_coupons = [];
            this.selected_promotions = [];
        }
        // Methods from plan will be added here
    }

    /**
     * API处理器：负责拦截和解析API数据
     */
    const APIHandler = {
        originalFetch: window.fetch,

        init: function() {
            const self = this;
            window.fetch = async function(...args) {
                const response = await self.originalFetch.apply(this, args);
                const url = args[0];

                if (typeof url === 'string' && url.includes('api.m.jd.com')) {
                    const clonedResponse = response.clone();
                    clonedResponse.json().then(data => {
                        if (url.includes('pcCart_jc_getCurrentCart')) {
                            console.log('Intercepted pcCart_jc_getCurrentCart:', data);
                            DataManager.processCartData(data);
                        } else if (url.includes('pcCart_jc_cartCouponList')) {
                            console.log('Intercepted pcCart_jc_cartCouponList:', data);
                            DataManager.processCouponData(data);
                        }
                    }).catch(err => {
                        // Non-JSON response or other error, ignore
                    });
                }

                return response;
            };
        }
    };

    /**
     * 数据管理器：作为数据中枢，管理cart对象
     */
    const DataManager = {
        cart: null, // 将持有cart对象的实例

        init: function() {
            this.cart = new Cart();
        },

        processCartData: function(data) {
            if (!data?.resultData?.cartInfo?.vendors) return;

            for (const vendor of data.resultData.cartInfo.vendors) {
                for (const sortedItem of vendor.sorted) {
                    const items = sortedItem.item.items?.length ? sortedItem.item.items.map(sub => sub.item) : [sortedItem.item];

                    for (const item of items) {
                        if (!item.Id || this.cart.skus.some(s => s.id === item.Id)) continue;

                        const sku = new Sku(item.Id, item.Name, item.Price, item.Num);
                        this.cart.skus.push(sku);

                        if (item.canSelectPromotions) {
                            for (const promoData of item.canSelectPromotions) {
                                let promotion = this.cart.promotions.find(p => p.id === promoData.id);
                                if (!promotion) {
                                    promotion = new Promotion(promoData.id, promoData.title, item.STip, item.suitType, item.suitLabel);
                                    this.cart.promotions.push(promotion);
                                }
                                if (!promotion.skus.includes(sku.id)) {
                                    promotion.skus.push(sku.id);
                                }
                                if (!sku.promotions.includes(promotion.id)) {
                                    sku.promotions.push(promotion.id);
                                }
                            }
                        }
                    }
                }
            }
            console.log("DataManager: Cart data processed.", this.cart);
        },

        processCouponData: function(data) {
            if (!data?.resultData) return;

            const allCoupons = [...(data.resultData.activeCoupons || []), ...(data.resultData.usableCoupons || [])];

            for (const couponData of allCoupons) {
                let coupon = this.cart.coupons.find(c => c.id === couponData.couponId);

                if (!coupon) {
                    coupon = new Coupon(
                        couponData.couponId,
                        couponData.name,
                        couponData.discount,
                        couponData.quota,
                        couponData.couponIconStyle,
                        couponData.plusStyle,
                        couponData.beginTime,
                        couponData.endTime,
                        couponData.overLap
                    );
                    this.cart.coupons.push(coupon);
                }

                if (couponData.items) {
                    for (const item of couponData.items) {
                        const sku = this.cart.skus.find(s => s.id === item.id);
                        if (sku) {
                            if (!coupon.skus.includes(sku.id)) {
                                coupon.skus.push(sku.id);
                            }
                            if (!sku.coupons.includes(coupon.id)) {
                                sku.coupons.push(coupon.id);
                            }
                        }
                    }
                }
            }
            console.log("DataManager: Coupon data processed.", this.cart);
            UIManager.renderFilters(); // Render filters after data is ready
        },

        recommend_bargain_skus: function(quota, availableSkus, mandatorySkus) {
            let plan_items = [...mandatorySkus];
            let balance = plan_items.reduce((sum, sku) => sum + (sku.price * sku.quantity), 0);

            const sorted_items = availableSkus
                .filter(sku => !plan_items.find(ps => ps.id === sku.id))
                .sort((a, b) => b.price - a.price);

            let exceeded_items = [];

            for (const item of sorted_items) {
                const item_sum = item.price * item.quantity;
                if (balance + item_sum <= quota) {
                    balance += item_sum;
                    plan_items.push(item);
                } else {
                    exceeded_items.push(item);
                }
            }

            // Refinement step (simplified for now)
            if (balance < quota && exceeded_items.length > 0) {
                // Find an item in exceeded_items that gets us closest to the quota
                exceeded_items.sort((a, b) => Math.abs(quota - (balance + a.price * a.quantity)) - Math.abs(quota - (balance + b.price * b.quantity)));
                const best_exceeded = exceeded_items[0];
                if (Math.abs(quota - (balance + best_exceeded.price * best_exceeded.quantity)) < Math.abs(quota - balance)) {
                     plan_items.push(best_exceeded);
                }
            }

            return plan_items;
        }
    };

    /**
     * UI管理器：负责所有DOM操作和用户交互
     */
    const UIManager = {
        init: function() {
            this.createToolbarButtons();
        },

        createToolbarButtons: function() {
            const operationDiv = document.querySelector('.operation');
            if (!operationDiv) return;

            const getCouponsBtn = this.createButton('获取优惠券', this.handleGetCouponsClick);
            const bargainBtn = this.createButton('凑单', this.handleBargainClick);
            const unselectAllBtn = this.createButton('取消全选', this.handleUnselectAllClick);

            operationDiv.appendChild(getCouponsBtn);
            operationDiv.appendChild(bargainBtn);
            operationDiv.appendChild(unselectAllBtn);
        },

        handleUnselectAllClick: function() {
            document.querySelectorAll('.item-item .jdcheckbox:checked').forEach(cb => cb.click());
        },

        handleBargainClick: function() {
            const selectedCoupons = DataManager.cart.selected_coupons.map(id => DataManager.cart.coupons.find(c => c.id == id));
            if (selectedCoupons.length === 0) {
                alert('请先选择一个优惠券!');
                return;
            }

            // Find the coupon with the highest quota
            const targetCoupon = selectedCoupons.reduce((max, c) => c.quota > max.quota ? c : max, selectedCoupons[0]);
            const quota = targetCoupon.quota;

            const availableSkus = DataManager.cart.skus.filter(sku => {
                const skuElement = document.querySelector(`[data-sku="${sku.id}"]`);
                return skuElement && skuElement.style.display !== 'none';
            });

            const mandatorySkus = Array.from(document.querySelectorAll('.item-item.item-seleted .jdcheckbox:checked'))
                .map(cb => cb.closest('.item-item').dataset.sku)
                .map(id => DataManager.cart.skus.find(s => s.id === id))
                .filter(Boolean);

            console.log(`Bargaining for coupon quota: ${quota}`);
            const planSkus = DataManager.recommend_bargain_skus(quota, availableSkus, mandatorySkus);
            
            const plan = new Plan(Date.now());
            plan.skus = planSkus;
            plan.coupons = [targetCoupon];
            plan.total_price = planSkus.reduce((sum, sku) => sum + sku.price * sku.quantity, 0);
            plan.real_price = plan.total_price - targetCoupon.discount; // Simplified calculation
            DataManager.cart.plans.push(plan);

            this.renderPlan(plan);
        },

        renderPlan: function(plan) {
            let plansContainer = document.getElementById('plans-container');
            if (!plansContainer) {
                plansContainer = document.createElement('div');
                plansContainer.id = 'plans-container';
                document.querySelector('.cart_count_detail').insertAdjacentElement('beforebegin', plansContainer);
            }

            const planDiv = document.createElement('div');
            planDiv.className = 'plan-item';
            planDiv.dataset.planId = plan.id;

            const skusHtml = plan.skus.map(sku => {
                const skuElement = document.querySelector(`[data-sku="${sku.id}"]`);
                const imgSrc = skuElement ? skuElement.querySelector('.p-img img').src : '';
                return `<img src="${imgSrc}" title="${sku.name}" width="50" height="50" style="margin-right: 5px;">`;
            }).join('');

            planDiv.innerHTML = `
                <div style="display: flex; align-items: center; padding: 10px; border: 1px solid #ddd; margin-bottom: 10px;">
                    <div style="flex-grow: 1;">${skusHtml}</div>
                    <div style="margin: 0 20px;">
                        <p>总价: ¥${plan.total_price.toFixed(2)}</p>
                        <p>折后: ¥${plan.real_price.toFixed(2)}</p>
                    </div>
                    <button class="apply-plan-btn">应用</button>
                </div>
            `;

            planDiv.querySelector('.apply-plan-btn').addEventListener('click', () => {
                console.log("Applying plan:", plan.skus.map(s => s.id));
                // 1. Uncheck all items first
                document.querySelectorAll('.item-item .jdcheckbox:checked').forEach(cb => cb.click());

                // 2. Check items in the plan
                setTimeout(() => { // Use a short timeout to ensure uncheck actions complete
                    plan.skus.forEach(sku => {
                        const skuElement = document.querySelector(`[data-sku="${sku.id}"]`);
                        if (skuElement) {
                            const checkbox = skuElement.querySelector('.jdcheckbox');
                            if (checkbox && !checkbox.checked) {
                                checkbox.click();
                            }
                        }
                    });
                }, 500);
            });

            plansContainer.appendChild(planDiv);
        },

        createButton: function(text, onClick) {
            const btn = document.createElement('a');
            btn.href = '#none';
            btn.className = 'opt-batch-follow'; // Reuse existing class for style
            btn.textContent = text;
            btn.style.marginLeft = '10px';
            btn.addEventListener('click', onClick.bind(this));
            return btn;
        },

        handleGetCouponsClick: function() {
            const couponBtns = document.querySelectorAll('.shop-coupon-btn');
            console.log(`Found ${couponBtns.length} coupon buttons to click.`);
            couponBtns.forEach((btn, index) => {
                setTimeout(() => {
                    btn.click();
                }, index * 800); // 800ms delay between clicks
            });
        },

        renderFilters: function() {
            this.renderCoupons();
            this.renderPromotions();
        },

        renderCoupons: function() {
            let couponContainer = document.getElementById('coupon-filter-div');
            if (!couponContainer) {
                couponContainer = document.createElement('div');
                couponContainer.id = 'coupon-filter-div';
                couponContainer.className = 'coupon-filter-container';
                document.querySelector('.toolbar-wrap').insertAdjacentElement('afterend', couponContainer);
            }
            couponContainer.innerHTML = '<h5>可用的优惠券:</h5>'; // Clear previous render
            
            DataManager.cart.coupons.forEach(coupon => {
                const btn = document.createElement('button');
                btn.textContent = `${coupon.title} (${coupon.quota}-${coupon.discount})`;
                btn.dataset.couponId = coupon.id;
                btn.addEventListener('click', (e) => this.toggleCouponFilter(e));
                couponContainer.appendChild(btn);
            });
        },

        renderPromotions: function() {
            let promotionContainer = document.getElementById('promotion-filter-div');
            if (!promotionContainer) {
                promotionContainer = document.createElement('div');
                promotionContainer.id = 'promotion-filter-div';
                promotionContainer.className = 'coupon-filter-container';
                document.getElementById('coupon-filter-div').insertAdjacentElement('afterend', promotionContainer);
            }
            promotionContainer.innerHTML = '<h5>可用的促销:</h5>'; // Clear previous render

            DataManager.cart.promotions.forEach(promo => {
                const btn = document.createElement('button');
                btn.textContent = promo.title;
                btn.dataset.promoId = promo.id;
                btn.addEventListener('click', (e) => this.togglePromotionFilter(e));
                promotionContainer.appendChild(btn);
            });
        },

        toggleCouponFilter: function(event) {
            const btn = event.target;
            const couponId = btn.dataset.couponId;
            const index = DataManager.cart.selected_coupons.indexOf(couponId);

            if (index > -1) {
                DataManager.cart.selected_coupons.splice(index, 1);
                btn.style.border = '';
            } else {
                DataManager.cart.selected_coupons.push(couponId);
                btn.style.border = '2px solid red';
            }
            this.filterSkuVisibility();
        },

        togglePromotionFilter: function(event) {
            const btn = event.target;
            const promoId = btn.dataset.promoId;
            const index = DataManager.cart.selected_promotions.indexOf(promoId);

            if (index > -1) {
                DataManager.cart.selected_promotions.splice(index, 1);
                btn.style.border = '';
            } else {
                DataManager.cart.selected_promotions.push(promoId);
                btn.style.border = '2px solid red';
            }
            this.filterSkuVisibility();
        },

        filterSkuVisibility: function() {
            const selectedCoupons = DataManager.cart.selected_coupons.map(id => DataManager.cart.coupons.find(c => c.id == id));
            const selectedPromos = DataManager.cart.selected_promotions.map(id => DataManager.cart.promotions.find(p => p.id == id));

            let visibleSkuIds = null;

            const allFilters = [...selectedCoupons, ...selectedPromos];

            if (allFilters.length === 0) {
                visibleSkuIds = new Set(DataManager.cart.skus.map(s => s.id));
            } else {
                const skuLists = allFilters.map(f => new Set(f.skus));
                visibleSkuIds = skuLists.reduce((acc, currentSet) => new Set([...acc].filter(skuId => currentSet.has(skuId))));
            }

            DataManager.cart.skus.forEach(sku => {
                const skuElement = document.querySelector(`[data-sku="${sku.id}"]`);
                if (skuElement) {
                    if (visibleSkuIds.has(sku.id)) {
                        skuElement.style.display = '';
                    } else {
                        skuElement.style.display = 'none';
                    }
                }
            });
        }
    };

    /**
     * 主函数/入口
     */
    function main() {
        console.log("Coupon Filter v2 Loaded!");
        DataManager.init();
        APIHandler.init();
        UIManager.init();
    }

    // 确保在页面完全加载后执行主函数
    if (document.readyState === "complete" || document.readyState === "interactive") {
        main();
    } else {
        window.addEventListener('load', main);
    }

})();
