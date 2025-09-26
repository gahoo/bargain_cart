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
            this.element = this._findElement(); // 查找正确的DOM元素
            this.coupons = [];
            this.promotions = [];
        }

        /**
         * @private
         * 查找SKU对应的顶层元素。
         * 可能是单个商品(.item-item)，也可能是一个套装(.item-combine)。
         * @returns {HTMLElement|null}
         */
        _findElement() {
            // 首先找到包含 data-sku 的 .item-item 元素
            const itemElement = document.querySelector(`.item-item[data-sku="${this.id}"]`);
            if (!itemElement) {
                console.warn(`Sku._findElement: 未找到 SKU ID 为 ${this.id} 的 .item-item 元素。`);
                return null;
            }

            // 检查该元素是否被一个 .item-combine (套装) 元素包裹
            const combineContainer = itemElement.closest('.item-combine');

            // 如果找到了套装容器，则返回套装容器作为操作目标；否则返回单个商品元素。
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
            if (!this.element) return;
            // Checkbox 应该在 element 内部
            const checkbox = this.element.querySelector('input.jdcheckbox');
            if (checkbox && !checkbox.checked) {
                checkbox.click();
            }
        }

        unselect() {
            if (!this.element) return;
            const checkbox = this.element.querySelector('input.jdcheckbox');
            if (checkbox && checkbox.checked) {
                checkbox.click();
            }
        }
    }

    class Coupon {
        constructor(id, title, skus, discount, quota, iconStyle, plusStyle, beginTime, endTime, overLap) {
            this.id = id;
            this.title = title;
            this.skus = skus || []; // 适用的商品ID列表
            this.discount = discount;
            this.quota = quota; // 使用门槛
            this.couponIconStyle = iconStyle;
            this.plusStyle = plusStyle;
            this.beginTime = beginTime;
            this.endTime = endTime;
            this.overLap = overLap;
            this.element = null; // 对应的UI按钮元素，由UIManager创建和赋值
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
    }

    class Promotion {
        constructor(id, title, sTip, suitType, suitLabel, skus) {
            this.id = id;
            this.title = title;
            this.STip = sTip;
            this.suitType = suitType;
            this.suitLabel = suitLabel;
            this.skus = skus || []; // 参与此活动的商品ID列表
            this.element = null; // 对应的UI按钮元素，由UIManager创建和赋值
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
            this.is_active = false;
        }

        /**
         * @private
         * 计算方案中所有商品的原价总和
         * @returns {number}
         */
        _calculateTotalPrice() {
            return this.skus.reduce((total, sku) => total + (sku.price * sku.quantity), 0);
        }

        // 应用方案：选中商品并触发价格更新
        apply() {
            // 假设cart.unselect_all_skus()由外部调用
            this.skus.forEach(sku => sku.select());

            // 通知UIManager去监听DOM变化并获取实际价格
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

        // 更新对应的UI元素
        update_element() {
            if (this.element && typeof UIManager.updatePlanElement === 'function') {
                UIManager.updatePlanElement(this);
            }
        }
    }

    // --- 模块：API处理器 ---

    const APIHandler = {
        init() {
            console.log("APIHandler initialized");
            // XHR拦截逻辑将在这里实现
        }
    };

    // --- 模块：数据管理器 ---
    const DataManager = {
        init() {
            console.log("DataManager initialized");
            // 数据处理和模型实例化逻辑将在这里实现
        }
    };

    // --- 模块：UI管理器 ---
    const UIManager = {
        init() {
            console.log("UIManager initialized");
            // DOM操作和用户交互逻辑将在这里实现
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
