// ==UserScript==
// @name         什么值得买购物车优惠券筛选器 v2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  在什么值得买购物车页面根据选中的商品筛选可用的优惠券和优惠活动，并提供凑单建议。
// @author       You
// @match        https://cart.smzdm.com/
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // --- 可配置常量 ---
    const CLICK_DELAY = 800; // 领券点击延迟（毫秒）

    // --- 工具函数 ---
    function addGlobalStyle(css) {
        const head = document.getElementsByTagName('head')[0];
        if (!head) { return; }
        const style = document.createElement('style');
        style.innerHTML = css;
        head.appendChild(style);
    }

    // --- 数据模型 ---
    class Sku {
        constructor(id, name, price, quantity) {
            this.id = id;
            this.name = name;
            this.price = price;
            this.quantity = quantity;
            this.element = this._findElement();
            this.coupons = [];
            this.promotions = [];

            const checkbox = this.element ? this.element.querySelector('input.jdcheckbox') : null;
            this.selected = checkbox ? checkbox.checked : false;
        }

        /**
         * @private
         * 查找SKU对应的顶层元素。
         * 可能是单个商品(.item-item)，也可能是一个套装(.item-combine)。
         * @returns {HTMLElement|null}
         */
        _findElement() {
            const itemElement = document.querySelector(`.item-item[data-sku="${this.id}"]`);
            if (!itemElement) {
                console.warn(`Sku._findElement: 未找到 SKU ID 为 ${this.id} 的 .item-item 元素。`);
                return null;
            }
            const combineContainer = itemElement.closest('.item-combine');
            return combineContainer || itemElement;
        }

        hide() {
            if (this.element) {
                this.element.classList.add('hidden');
            }
        }

        show() {
            if (this.element) {
                this.element.classList.remove('hidden');
            }
        }

        select() {
            this.selected = true;
            if (!this.element) {
                return;
            }
            const checkbox = this.element.querySelector('input.jdcheckbox');
            if (checkbox && !checkbox.checked) {
                checkbox.click();
            }
        }

        unselect() {
            this.selected = false;
            if (!this.element) {
                return;
            }
            const checkbox = this.element.querySelector('input.jdcheckbox');
            if (checkbox && checkbox.checked) {
                checkbox.click();
            }
        }

        append_coupon(coupon) {
            if (coupon && !this.coupons.some(c => c.id === coupon.id)) {
                this.coupons.push(coupon);
            }
        }

        append_promotion(promotion) {
            if (promotion && !this.promotions.some(p => p.id === promotion.id)) {
                this.promotions.push(promotion);
            }
        }
    }

    class Coupon {
        constructor(id, title, skus, discount, quota, iconStyle, plusStyle, beginTime, endTime, overLap) {
            this.id = id;
            this.title = title;
            this.skus = []; // 初始化为空，将通过append_sku添加Sku对象
            this.discount = discount;
            this.quota = quota;
            this.couponIconStyle = iconStyle;
            this.plusStyle = plusStyle;
            this.beginTime = beginTime;
            this.endTime = endTime;
            this.overLap = overLap;
            this.element = null;
            this.selected = false;
        }

        hide() { if (this.element) { this.element.classList.add('hidden'); } }

        show() { if (this.element) { this.element.classList.remove('hidden'); } }

        select() {
            this.selected = true;
            if (typeof UIManager.updateCouponSelection === 'function') {
                UIManager.updateCouponSelection(this);
            }
        }

        unselect() {
            this.selected = false;
            if (typeof UIManager.updateCouponSelection === 'function') {
                UIManager.updateCouponSelection(this);
            }
        }

        append_sku(sku) {
            if (sku && !this.skus.some(s => s.id === sku.id)) {
                this.skus.push(sku);
            }
        }
    }

    class Promotion {
        constructor(id, title, sTip, suitType, suitLabel, skus) {
            this.id = id;
            this.title = title;
            this.STip = sTip;
            this.suitType = suitType;
            this.suitLabel = suitLabel;
            this.skus = []; // 初始化为空，将通过append_sku添加Sku对象
            this.element = null;
            this.selected = false;
        }

        hide() { if (this.element) { this.element.classList.add('hidden'); } }

        show() { if (this.element) { this.element.classList.remove('hidden'); } }

        select() {
            this.selected = true;
            if (typeof UIManager.updatePromotionSelection === 'function') {
                UIManager.updatePromotionSelection(this);
            }
        }

        unselect() {
            this.selected = false;
            if (typeof UIManager.updatePromotionSelection === 'function') {
                UIManager.updatePromotionSelection(this);
            }
        }

        append_sku(sku) {
            if (sku && !this.skus.some(s => s.id === sku.id)) {
                this.skus.push(sku);
            }
        }
    }
    }

    class Plan {
        constructor(id, skus, coupons, promotions) {
            this.id = id || Date.now();
            this.skus = skus || [];
            this.coupons = coupons || [];
            this.promotions = promotions || [];
            this.element = null;
            this.total_price = this._calculateTotalPrice();
            this.real_price = 0; // 由UIManager异步更新
            this.selected = false; // 代替 is_active
        }

        /**
         * @private
         * 计算方案中所有商品的原价总和
         * @returns {number}
         */
        _calculateTotalPrice() {
            return this.skus.reduce((total, sku) => total + (sku.price * sku.quantity), 0);
        }

        apply() {
            this.skus.forEach(sku => sku.select());
            if (typeof UIManager.fetchRealPriceForPlan === 'function') {
                UIManager.fetchRealPriceForPlan(this);
            }
        }

        unapply() {
            this.skus.forEach(sku => sku.unselect());
        }

        add_sku(sku) {
            if (!this.skus.find(s => s.id === sku.id)) {
                this.skus.push(sku);
                this.total_price = this._calculateTotalPrice();
                this.update_element();
            }
        }

        remove_sku(skuId) {
            this.skus = this.skus.filter(s => s.id !== skuId);
            this.total_price = this._calculateTotalPrice();
            this.update_element();
        }

        update_element() {
            if (this.element && typeof UIManager.updatePlanElement === 'function') {
                UIManager.updatePlanElement(this);
            }
        }

        select() {
            this.selected = true;
            if (typeof UIManager.updatePlanSelection === 'function') {
                UIManager.updatePlanSelection(this);
            }
        }

        unselect() {
            this.selected = false;
            if (typeof UIManager.updatePlanSelection === 'function') {
                UIManager.updatePlanSelection(this);
            }
        }
    }

    class Cart {
        constructor() {
            this.skus = [];
            this.coupons = [];
            this.promotions = [];
            this.plans = [];
        }

        // --- Getters ---
        get_sku(skuId) {
            return this.skus.find(s => s.id === skuId);
        }
        get_coupon(couponId) {
            return this.coupons.find(c => c.id === couponId);
        }
        get_promotion(promoId) {
            return this.promotions.find(p => p.id === promoId);
        }
        get_plan(planId) {
            return this.plans.find(p => p.id === planId);
        }

        get_selected_skus() {
            return this.skus.filter(s => s.selected);
        }
        get_selected_coupons() {
            return this.coupons.filter(c => c.selected);
        }
        get_selected_promotions() {
            return this.promotions.filter(p => p.selected);
        }

        get_selected_plan() {
            return this.plans.find(p => p.selected);
        }

        // --- Relationship Getters ---
        get_sku_coupons(skuId) {
            return this.get_sku(skuId)?.coupons || [];
        }
        get_coupon_skus(couponId) {
            return this.get_coupon(couponId)?.skus || [];
        }
        get_sku_promotions(skuId) {
            return this.get_sku(skuId)?.promotions || [];
        }
        get_promotion_skus(promoId) {
            return this.get_promotion(promoId)?.skus || [];
        }

        // --- Filtering Methods (Placeholders) ---
        filter_coupons_by_skus(skus) { /* ... */ }
        filter_promotions_by_skus(skus) { /* ... */ }
        filter_skus_by_coupons(coupons) { /* ... */ }
        filter_skus_by_promotions(promotions) { /* ... */ }

        // --- Recommendation Algorithms (Placeholders) ---
        recommend_bargain_skus() {
            return [];
        }
        llm_recommend_bargain_skus() {
            return [];
        }

        // --- Global Actions ---
        unselect_all_skus() {
            this.skus.forEach(sku => sku.unselect());
        }
        unselect_all_coupons() {
            this.coupons.forEach(coupon => coupon.unselect());
        }
        unselect_all_promotions() {
            this.promotions.forEach(promotion => promotion.unselect());
        }

        hide_all_skus() {
            this.skus.forEach(sku => sku.hide());
        }
        show_all_skus() {
            this.skus.forEach(sku => sku.show());
        }

        select_plan(planToSelect) {
            this.plans.forEach(p => {
                if (p.id === planToSelect.id) {
                    p.select();
                } else {
                    p.unselect();
                }
            });
        }
    }

    // --- 模块：API处理器 ---

    const APIHandler = {
        // URL片段到具体数据处理函数的映射
        // 注意：必须.bind(DataManager)来确保处理器内部的this指向正确
        apiMap: {
            'pcCart_jc_getCurrentCart': DataManager.processCartData.bind(DataManager),
            'pcCart_jc_cartCouponList': DataManager.processCouponData.bind(DataManager)
        },

        init() {
            console.log("APIHandler initialized");
            this.proxyXHR();
        },

        proxyXHR() {
            const open = XMLHttpRequest.prototype.open;
            const send = XMLHttpRequest.prototype.send;
            const self = this;

            XMLHttpRequest.prototype.open = function(method, url) {
                this._url = url;
                this._dataProcessor = null; // 初始化数据处理器

                const matchedKeys = Object.keys(self.apiMap).filter(key => url.includes(key));

                if (matchedKeys.length > 0) {
                    const key = matchedKeys[0];
                    this._dataProcessor = self.apiMap[key]; // 获取对应的、已绑定上下文的处理函数
                }

                return open.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function() {
                if (this._dataProcessor) { // 如果在open时找到了对应的处理器
                    this.addEventListener("load", function() {
                        if (this.status === 200) {
                            try {
                                const data = JSON.parse(this.responseText);
                                // 直接调用附加在XHR对象上的数据处理函数
                                this._dataProcessor(data);
                            } catch (error) {
                                console.error("Error parsing API response:", error);
                            }
                        }
                    });
                }
                return send.apply(this, arguments);
            };
        }
    };

    // --- 模块：数据管理器 ---
    const DataManager = {
        cart: null, // 将用于存储唯一的Cart实例

        init() {
            console.log("DataManager initialized");
            this.cart = new Cart();
        },

        // 处理来自 pcCart_jc_getCurrentCart 的数据
        processCartData(data) {
            console.log("Processing Cart Data:", data);
            if (!data?.resultData?.cartInfo?.vendors) {
                console.error("Invalid cart data structure");
                return;
            }

            const handleItemData = (itemData) => {
                if (!itemData || !itemData.Id) return null;

                // 1. 查找或创建 Sku 对象
                let sku = this.cart.get_sku(itemData.Id);
                if (!sku) {
                    sku = new Sku(itemData.Id, itemData.Name, itemData.Price, itemData.Num);
                    this.cart.skus.push(sku);
                }

                // 2. 查找或创建该商品关联的 Promotion 对象，并建立双向关联
                if (itemData.canSelectPromotions && itemData.canSelectPromotions.length > 0) {
                    for (const promoData of itemData.canSelectPromotions) {
                        if (!promoData.id) continue;
                        let promotion = this.cart.get_promotion(promoData.id);
                        if (!promotion) {
                            promotion = new Promotion(promoData.id, promoData.title, promoData.STip, promoData.suitType, promoData.suitLabel);
                            this.cart.promotions.push(promotion);
                        }
                        sku.append_promotion(promotion);
                        promotion.append_sku(sku);
                    }
                }
                return sku;
            };

            for (const vendor of data.resultData.cartInfo.vendors) {
                if (!vendor.sorted) continue;

                /*
                 * 根据观察, sortItem.itemType 的可能取值及意义:
                 * - 1: 常规商品
                 * - 4: 套装商品 (其 .item.items 数组包含实际商品)
                 * - 9: 促销组合 (其 .item.items 数组包含实际商品)
                 *
                 * 代码主要通过判断 .item.items 是否存在且非空来识别集合类商品 (鸭子类型),
                 * 但在处理促销组合时，会显式检查 itemType === 9 来应用其容器自身的促销信息。
                 */
                for (const sortItem of vendor.sorted) {
                    // 集合类商品 (套装/促销)
                    if (sortItem.item?.items?.length > 0) {
                        // 如果是促销组合(itemType:9)，它本身也定义了一个促销活动
                        if (sortItem.itemType === 9 && sortItem.item?.promotionId) {
                            const promoData = sortItem.item;
                            let containerPromotion = this.cart.get_promotion(promoData.promotionId);
                            if (!containerPromotion) {
                                containerPromotion = new Promotion(promoData.promotionId, promoData.Name, promoData.STip, promoData.suitType, promoData.suitLabel);
                                this.cart.promotions.push(containerPromotion);
                            }

                            // 处理该促销下的所有商品
                            for (const subItem of sortItem.item.items) {
                                const sku = handleItemData(subItem.item);
                                if (sku) {
                                    sku.append_promotion(containerPromotion);
                                    containerPromotion.append_sku(sku);
                                }
                            }
                        } else {
                            // 普通套装(itemType:4)，只处理商品
                            for (const subItem of sortItem.item.items) {
                                handleItemData(subItem.item);
                            }
                        }
                    } 
                    // 单个商品
                    else if (sortItem.item) {
                        handleItemData(sortItem.item);
                    }
                }
            }

            console.log(`Skus processed: ${this.cart.skus.length}`);
            console.log(`Promotions processed: ${this.cart.promotions.length}`);

            // 通知UI管理器SKU数据已就绪，可以注入依赖SKU的按钮
            UIManager.injectSkuActionButtons();
        },

// 处理来自 pcCart_jc_cartCouponList 的数据
        processCouponData(data) {
            console.log("Processing Coupon Data:", data);
            if (!data?.resultData) {
                console.error("Invalid coupon data structure");
                return;
            }

            const allCouponsData = [
                ...(data.resultData.activeCoupons || []),
                ...(data.resultData.usableCoupons || [])
            ];

            for (const couponData of allCouponsData) {
                if (!couponData.couponId) continue;

                // 1. 查找或创建 Coupon 对象
                let coupon = this.cart.get_coupon(couponData.couponId);
                if (!coupon) {
                    coupon = new Coupon(
                        couponData.couponId,
                        couponData.name,
                        [], // skus 列表将通过 append_sku 填充
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

                // 2. 查找或创建关联的 Sku 对象，并建立双向关联
                const skuIds = couponData.items?.map(item => String(item.id)) || [];
                for (const skuId of skuIds) {
                    const sku = this.cart.get_sku(skuId);
                    if (sku) {
                        sku.append_coupon(coupon);
                        coupon.append_sku(sku);
                    }
                }
            }

            console.log(`Coupons processed: ${this.cart.coupons.length}`);
        }
    };

    // --- 模块：UI管理器 ---
    const UIManager = {
        init() {
            console.log("UIManager initialized");
            this.injectCoreStyles();
            this.injectContainers();
            this.injectButtons();
        },

        // 注入脚本所需的核心CSS
        injectCoreStyles() {
            addGlobalStyle(`
                .hidden { display: none !important; }
                .coupon-filter-container, .promotion-filter-container, .plan-container {
                    margin: 10px 0;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                }
            `);
        },

        // 注入UI容器
        injectContainers() {
            const toolbarWrap = document.querySelector('.toolbar-wrap');
            const cartCountDetail = document.querySelector('.cart_count_detail');

            if (toolbarWrap) {
                const couponContainer = document.createElement('div');
                couponContainer.className = 'coupon-filter-container';
                couponContainer.innerHTML = '<div class="coupon-list"></div>';
                toolbarWrap.parentNode.insertBefore(couponContainer, toolbarWrap.nextSibling);

                const promotionContainer = document.createElement('div');
                promotionContainer.className = 'promotion-filter-container';
                promotionContainer.innerHTML = '<div class="promotion-list"></div>';
                couponContainer.parentNode.insertBefore(promotionContainer, couponContainer.nextSibling);
            }

            if (cartCountDetail) {
                const planContainer = document.createElement('div');
                planContainer.className = 'plan-container';
                planContainer.innerHTML = '<div class="plan-list"></div>';
                cartCountDetail.parentNode.insertBefore(planContainer, cartCountDetail);
            }
        },

        // 注入功能按钮
        injectButtons() {
            const operationDiv = document.querySelector('.operation');
            if (!operationDiv) return;

            // 1. 创建“获取优惠券”按钮
            const getCouponsBtn = document.createElement('a');
            getCouponsBtn.href = '#none';
            getCouponsBtn.innerText = '获取优惠券';
            getCouponsBtn.style.marginLeft = '10px';
            getCouponsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const allCouponBtns = document.querySelectorAll('.shop-coupon-btn');
                let index = 0;
                function clickNext() {
                    if (index >= allCouponBtns.length) return;
                    allCouponBtns[index].click();
                    index++;
                    setTimeout(clickNext, CLICK_DELAY);
                }
                clickNext();
            });

            // 2. 创建“取消选中所有商品”按钮
            const unselectAllBtn = document.createElement('a');
            unselectAllBtn.href = '#none';
            unselectAllBtn.innerText = '取消全选';
            unselectAllBtn.style.marginLeft = '10px';
            unselectAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                DataManager.cart.unselect_all_skus();
            });

            // 3. 创建“取消选中所有优惠”按钮
            const unselectAllFiltersBtn = document.createElement('a');
            unselectAllFiltersBtn.href = '#none';
            unselectAllFiltersBtn.innerText = '取消选中所有优惠';
            unselectAllFiltersBtn.style.marginLeft = '10px';
            unselectAllFiltersBtn.addEventListener('click', (e) => {
                e.preventDefault();
                DataManager.cart.unselect_all_coupons();
                DataManager.cart.unselect_all_promotions();
            });

            // 4. 创建“凑单”按钮
            const bargainBtn = document.createElement('a');
            bargainBtn.href = '#none';
            bargainBtn.innerText = '凑单';
            bargainBtn.style.marginLeft = '10px';
            bargainBtn.addEventListener('click', (e) => {
                e.preventDefault();
                DataManager.cart.recommend_bargain_skus();
            });

            // 5. 创建“AI凑单”按钮
            const aiBargainBtn = document.createElement('a');
            aiBargainBtn.href = '#none';
            aiBargainBtn.innerText = 'AI凑单';
            aiBargainBtn.style.marginLeft = '10px';
            aiBargainBtn.addEventListener('click', (e) => {
                e.preventDefault();
                DataManager.cart.llm_recommend_bargain_skus();
            });

            // 按顺序添加所有按钮
            operationDiv.appendChild(getCouponsBtn);
            operationDiv.appendChild(unselectAllBtn);
            operationDiv.appendChild(unselectAllFiltersBtn);
            operationDiv.appendChild(bargainBtn);
            operationDiv.appendChild(aiBargainBtn);
        },

        // 为每个商品行注入“添加至方案”按钮
        injectSkuActionButtons() {
            for (const sku of DataManager.cart.skus) {
                if (!sku.element) continue;

                const pOpsDiv = sku.element.querySelector('.p-ops');
                if (pOpsDiv) {
                    // 防止重复注入
                    if (pOpsDiv.querySelector('.add-to-plan-btn')) continue;

                    const addToPlanBtn = document.createElement('a');
                    addToPlanBtn.href = '#none';
                    addToPlanBtn.innerText = '添加至方案';
                    addToPlanBtn.className = 'add-to-plan-btn';
                    addToPlanBtn.style.marginLeft = '10px';

                    addToPlanBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const selectedPlan = DataManager.cart.get_selected_plan();
                        if (selectedPlan) {
                            selectedPlan.add_sku(sku);
                        } else {
                            this.showMessage('请先选择一个凑单方案！', 'warning');
                        }
                    });
                    pOpsDiv.appendChild(addToPlanBtn);
                }
            }
        },

        // 显示顶部弹出消息
        showMessage(message, type = 'info') {
            // 移除已存在的消息，确保每次只显示一个
            document.querySelector('.cart-filter-top-popup')?.remove();

            const optionsBox = document.querySelector('.fixed_center .options-box');
            if (!optionsBox) return;

            const popup = document.createElement('div');
            popup.className = 'cart-filter-top-popup';
            // 根据消息类型可以添加不同的class，例如 cart-filter-top-popup-warning
            popup.innerHTML = `<span class="iconjj"></span><span>${message}</span><i class="icon-popup-cls"></i>`;
            
            optionsBox.parentNode.insertBefore(popup, optionsBox.nextSibling);

            const close = () => popup.remove();

            // 点击关闭按钮
            const closeBtn = popup.querySelector('.icon-popup-cls');
            if (closeBtn) {
                closeBtn.addEventListener('click', close);
            }

            // 3秒后自动消失
            setTimeout(close, 3000);
        }
    };

    // --- 主函数 ---
    function main() {
        console.log("脚本启动");
        APIHandler.init();
        DataManager.init();
        UIManager.init();
    }

    // --- 启动脚本 ---
    // 使用MutationObserver确保在页面加载完成后执行
    const observer = new MutationObserver((mutations, obs) => {
        // 寻找一个页面加载完成的标志性元素，例如购物车列表
        if (document.querySelector('.cart-tbody')) {
            main();
            obs.disconnect(); // 找到后停止观察，避免重复执行
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
