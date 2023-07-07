// ==UserScript==
// @name         coupon_filter
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  filter item by coupons
// @author       Gahoo
// @match        https://cart.jd.com/cart_index
// @connect      api.m.jd.com
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';
    const INTERVAL = 800; //millisecond
    var style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = `
    div.coupon-item {
       max-width: 200px;
       margin: 4px;
       position: relative;
       border-width: 1px;
    }

    div.coupon-item.D_shop {
       background-color: #b8d2f5;
    }

    div.coupon-item.D_limited {
       background-color: #f5b8d8;
    }

    div.coupon-item.D_all {
       background-color: #b8f5bb;
    }

    div.coupon-item.active {
       border-style: dashed;
    }

    div.coupon-item.usable {
       border-style: solid;
    }

    div.coupon-item.plus {
       border-color: gold;
    }

    div.coupon-item.chosen {
       border-width: medium;
    }

    div.coupon-item.has-items {
       cursor: pointer;
    }

    a.coupon-plan-destroyer{
       cursor: pointer;
    }

    .has-no-overlap-items {
       opacity: 0.5;
    }

    .has-overlap-items {
       animation: blinker 1.5s linear infinite;
    }

    @keyframes blinker {
       50% {
           opacity: 0.5;
       }
    }

    .hidden {
       display: none;
    }

    .cart-tbody:has(.hidden) > div.shop{
       display: none;
    }

    .item-combine:has(.hidden) > .item-header{
       display: none;
    }

    .coupon-plan-note {
       display: block;
    }

    .item-list:has(.hidden){
       border: unset;
       border-top: unset;
    }

    .item-combine:has(.hidden){
       border-top: unset;
    }

    span.coupon-item.discount {
       content: '';
       position: absolute;
       background: #ffffff8c;
       top: 0;
       bottom: 0;
       right: 0;
       width: attr(data-width %);
    }

    div.coupon-filter {
        display: flex;
        flex-wrap: wrap;
        flex-direction: row;
    }

    div.coupon-plan {
        display: flex;
        flex-wrap: wrap;
        flex-direction: row;
        align-items: center;
    }

    a.coupon-plan-item {
        position: relative;
        padding-right: 16px;
    }

    a.coupon-plan-item:after {
        content: attr(data-quantity);
        background-color: #ffffffb0;
        position: absolute;
        bottom: 4px;
        right: 8px;
        font-size: 2em;
    }

    a.coupon-plan-item:before {
        content: attr(data-price);
        background-color: #ffffffb0;
        position: absolute;
        left: 0;
        font-size: 1.2em;
    }

    a.coupon-plan-item:hover:before {
        content: attr(data-sum);
    }

    a.coupon-plan-item:hover:after {
        content: attr(title);
        font-size: 0.1em;
        max-height: 60px;
    }

    button.coupon-filter-btn {
        position: fixed;
        left: 20px;
        top: 150px;
    }
    `;
    document.head.appendChild(style);

    function data2query(data){
        return(Object.entries(data)
            .map(([key, value]) => `${key}=${value}`)
            .join("&"));
    };

    function notify(text){
        const notification = document.createElement("div");
        notification.textContent = text;
        notification.classList.add("cart-filter-top-popup");

        // Fade out the notification after 5 seconds.
        setTimeout(() => {
            //notification.classList.add("fade-out");
            notification.remove();
        }, 5000);

        // Append the notification to the DOM.
        document.querySelector('.switch-cart').insertAdjacentElement('afterend', notification);
    }

    function getArea(){
        return document.querySelector('div.ui-area-text').dataset.id.replaceAll('-', '_')
    }

    function buildCouponListBody(vendor){
        var body = {
            "serInfo": {
                "area": getArea()
            },
            "cartExt": {
                "venderId": vendor.vendorId
            },
            "operations": []
        };

        var TheSkus = [];

        vendor.sorted.forEach(function(sorted){
            if(sorted.item.items.length){
                sorted.item.items.forEach(function(item){
                console.log(item.item.Name);
                TheSkus.push({"cid": item.item.cid, "type": item.itemType, "Id": item.item.Id, "skuUuid": item.item.skuUuid, "useUuid": item.item.useUuid});
                })
            }else{
                var item = sorted.item;
                console.log(item.Name);
                TheSkus.push({"cid": item.cid, "type": sorted.itemType, "Id": item.Id, "skuUuid": item.skuUuid, "useUuid": item.useUuid});
            }
        })
        //console.log(TheSkus)

        body.operations.push({"TheSkus": TheSkus})

        return body
    }

    function buildCurrentCartBody(args){
        return {
            "serInfo": {
                "area": getArea()
            },
            "cartExt": {
                "specialId": 1
            }
        }
    }

    function logger(response){
        console.log(response.response)
    }

    function addClassToSelected(selector, class_to_add){
        document.querySelectorAll(selector).forEach(function(item){
            if(!item.classList.contains(class_to_add)){
                item.classList.add(class_to_add)
            }
        })
    }

    function removeClassFromSelected(selector, class_to_remove){
        document.querySelectorAll(selector).forEach(function(item){
            item.classList.remove(class_to_remove)
        })
    }

    function removeClassByIds(item_ids, class_to_remove){
        item_ids.forEach(function(id){
            var item = document.getElementById(id);
            if(item){
                item.classList.remove(class_to_remove);
            }
        })
    }

    function intersectArray(array1, array2){
        return(array1.filter(x => array2.includes(x)));
    }

    function unionArray(array1, array2){
        return(Array.from(new Set(array1.concat(array2))));
    }

    function getItemIds(items){
        var item_ids = [];
        if(items){
            items.forEach(function(item){
                item_ids.push(item.id.toString());
            })
        }
        return(item_ids)
    }

    function appendCouponItems(coupon_div, items){
        var item_ids = coupon_div.dataset.items.split(',');
        item_ids = unionArray(item_ids, getItemIds(items))
        coupon_div.dataset.items = item_ids.join(',').replace(/^,/, "");
        if(coupon_div.dataset.items && !coupon_div.classList.contains('has-items')){
            coupon_div.classList.add('has-items')
        }
    }

    function setCouponItems(coupon_div, items){
        coupon_div.dataset.items = getItemIds(items).join(',');
        if(coupon_div.dataset.items){
            coupon_div.classList.add('has-items')
        }
    }

    function createCouponDiscountSpan(coupon){
        var discount = document.createElement('span')
        discount.className = "coupon-item discount"
        if(coupon.discount){
            discount.style.width = Math.round(100 * coupon.discount / coupon.quota) + "%";
        }else{
            discount.style.width = (coupon.preciseDiscount * 100) + "%";
        }
        return(discount)
    }

    function setCouponText(coupon_div, coupon){
        if(coupon.discount){
            coupon_div.textContent = coupon.quota + ' - ' + coupon.discount;
        }else{
            coupon_div.textContent = coupon.discountDesc;
        }
    }

    function setCouponStyleClass(coupon_div, coupon){
        switch(coupon.couponIconStyle){
            case "店铺东券":
                coupon_div.classList.add('D_shop');
                break;
            case "限品类东券":
                coupon_div.classList.add('D_limited');
                break;
            case "全品类东券":
                coupon_div.classList.add('D_all');
                break;
            default:
                coupon_div.classList.add(coupon.couponIconStyle);
        }
        //console.log(coupon.couponIconStyle);
        if(coupon.plusStyle){
            coupon_div.classList.add('plus');
        }
    }

    function toggleCouponChosenClass(coupon_div){
        if(coupon_div.classList.contains("chosen")){
            coupon_div.classList.remove("chosen");
        }else{
            coupon_div.classList.add("chosen");
        }
    }

    function hideUnchosenCouponItems(){
        removeClassFromSelected('.item-item.hidden', 'hidden')
        removeClassFromSelected('.item-suit.hidden', 'hidden')
        var item_ids = [];
        document.querySelectorAll('.chosen').forEach(function(chosen, i){
            var chosen_item_ids = chosen.dataset.items.split(',');
            //OR
            //item_ids = unionArray(item_ids, chosen_item_ids);
            //AND
            if(i == 0){
                item_ids = chosen_item_ids;
                return
            }else{
                item_ids = intersectArray(item_ids, chosen_item_ids)
            }
        });

        if(document.querySelectorAll('.chosen').length > 0){
            addClassToSelected('.item-item', 'hidden')
            addClassToSelected('.item-suit', 'hidden')
        }
        if(item_ids.length){
            removeClassByIds(item_ids, 'hidden');
        }
        return(item_ids)
    }

    function greyoutNotOverlapCoupons(item_ids){
        removeClassFromSelected('div.coupon-item.has-no-overlap-items', 'has-no-overlap-items');
        if(item_ids.length > 0 && document.querySelectorAll('.chosen').length > 0){
            document.querySelectorAll('div.coupon-item').forEach(function(coupon_div){
                var coupon_item_ids = coupon_div.dataset.items.split(',');
                if(intersectArray(item_ids, coupon_item_ids).length == 0){
                    coupon_div.classList.add('has-no-overlap-items')
                }
            });
        }
    }

    function createCouponDiv(coupons, extra_class){
        if(!coupons){
            return
        }

        coupons.forEach(function(coupon){
            var coupon_div = document.getElementById(coupon.couponId);
            if(coupon_div){
                appendCouponItems(coupon_div, coupon.items);
                return
            }else{
                coupon_div = document.createElement('div');
            }
            coupon_div.className = "coupon-item";
            coupon_div.classList.add(extra_class);
            coupon_div.id = coupon.couponId;
            coupon_div.title = coupon.name;
            setCouponText(coupon_div, coupon);

            coupon_div.dataset.overLap = coupon.overLap;
            coupon_div.dataset.type = coupon.type;
            coupon_div.dataset.plusStyle = coupon.plusStyle;
            coupon_div.dataset.couponIconStyle = coupon.couponIconStyle;
            setCouponStyleClass(coupon_div, coupon)

            coupon_div.dataset.beginTime = coupon.beginTime;
            coupon_div.dataset.endTime = coupon.endTime;
            coupon_div.dataset.quota = coupon.quota;
            coupon_div.dataset.discount = coupon.discount;
            if(coupon.discountDesc){
                coupon_div.dataset.discountDesc = coupon.discountDesc;
            }

            setCouponItems(coupon_div, coupon.items);

            coupon_div.appendChild(createCouponDiscountSpan(coupon));

            coupon_div.addEventListener('click', function(){
                toggleCouponChosenClass(this);
                var chosen_coupon_items = hideUnchosenCouponItems();
                greyoutNotOverlapCoupons(chosen_coupon_items);
            })

            document.querySelector('div.coupon-filter').appendChild(coupon_div);
        });
    }

    function appendCoupon(response){
        createCouponDiv(response.resultData.activeCoupons, "active");
        createCouponDiv(response.resultData.usableCoupons, "usable")
    }

    function getItemTextOf(item, selector){
        return(item.querySelector(selector).textContent);
    }

    function getItemSum(item){
        return(Number(getItemTextOf(item, '.p-sum').replace('¥', '')));
    }

    function getItemPrice(item){
        return(Number(getItemTextOf(item, '.p-price').replace('¥', '')));
    }

    function createItemPlan(item){
        var item_a = document.createElement('a');
        item_a.className = 'coupon-plan-item';
        item_a.href = "#" + item.id;
        item_a.dataset.id = item.id;
        item_a.dataset.skuuuid = item.dataset.skuuuid;
        item_a.dataset.quantity = item.querySelector('.quantity').querySelector('input').value;
        if(item.querySelector('.p-price-cont')){
            item_a.dataset.price = item.querySelector('.p-price-cont').textContent;
        }else{
            item_a.dataset.price = item.querySelector('.project-price').textContent;
        }
        item_a.dataset.sum = item.querySelector('.p-sum').textContent;
        var ref = item.querySelector('.p-img > a');
        item_a.title = ref.title;
        var img = ref.querySelector('img');
        if(!img){
            notify('❌请滚动页面确保所有图片都被正确加载。')
        }
        item_a.appendChild(img.cloneNode());
        //var item_name = document.createElement('span');
        //item_name.className = 'coupon-plan-item item-name';
        //item_name.textContent = ref.title;
        //item_a.appendChild(item_name);
        return(item_a);
    }

    function createPlanCheckbox(){
        var check_plan_items = document.createElement('input');
        check_plan_items.className = 'coupon-plan-item-selector'
        check_plan_items.type = 'checkbox';
        check_plan_items.addEventListener('click', function(){
            var request_param = {
                'RequestParam': {
                    'operations': [],
                    'serInfo': {
                        "area": getArea()
                    }
                }
            };
            var TheSkus = [];
            this.parentElement.querySelectorAll('a.coupon-plan-item').forEach(function(a, i){
                TheSkus.push({"Id": a.dataset.id, "num": a.dataset.quantity, "skuUuid": a.dataset.skuuuid, "useUuid": false});
            })
            request_param.RequestParam.operations.push({"TheSkus": TheSkus});
            if(this.checked){
                unsafeWindow.CartAction('OPT_CARTCHECKONE', request_param);
            }else{
                unsafeWindow.CartAction('OPT_CARTUNCHECKONE', request_param);
            }
        });
        return(check_plan_items)
    }

    function createPlanRemover(){
        var plan_remover = document.createElement('a');
        plan_remover.className = 'coupon-plan-destroyer';
        plan_remover.textContent = '🗑️';
        plan_remover.addEventListener('click', function(){
            this.parentElement.remove()
        });
        return(plan_remover)
    }

    function createPlanNotes(plan_item_list, max_coupon){
        var quota = max_coupon.dataset.quota;
        var discount = max_coupon.dataset.discount;
        var balance = plan_item_list.dataset.balance;

        var note = document.createElement('div');
        note.className= 'coupon-plan-note';
        var remaining = Math.round(100 * (quota - balance)) / 100;
        if(remaining > 0){
            note.innerHTML = '<span class="coupon-plan-note reamin">还需要凑单<strong>' + remaining + '</strong>元</span>';
        }else if(remaining < 0){
            var percentage = Math.round(100 * (balance - discount) / balance)/ 100;
            note.innerHTML = '<span class="coupon-plan-note remain">超出了<strong>' + Math.abs(remaining) + '</strong>元</span>' +
                '<span class="coupon-plan-note discount">相当于<strong>' + percentage + '</strong>折</span>' +
                createDetailNotesSpan(plan_item_list, percentage, balance - discount);
        }
        return(note)
    }

    function createDetailNotesSpan(plan_item_list, percentage, total_price){
        var inner_html = '';
        var terms = [];
        [].slice.call(plan_item_list.children).forEach(function(item){
            let price = Math.round(100 * item.dataset.price.replace('￥', '') * percentage) / 100;
            let quantity = item.dataset.quantity;
            if(quantity > 1){
                terms.push('<strong>' + price + '</strong>×' + quantity);
            }else{
                terms.push('<strong>' + price + '</strong>');
            }
        });
        inner_html = '<span class="coupon-plan-note equation">' + terms.join(' + ') + ' = <strong>' + total_price + '</strong></span>'
        return(inner_html)
    }

    function createCouponList(){
        var coupon_list = document.createElement('div');
        coupon_list.className = 'coupon-list';

        document.querySelectorAll('div.coupon-item.chosen').forEach(function(coupon){
            var duplicated_coupon = coupon.cloneNode(true)
            duplicated_coupon.id = '';
            duplicated_coupon.classList.remove('has-items');
            duplicated_coupon.classList.remove('chosen');
            duplicated_coupon.removeEventListener('click');
            coupon_list.appendChild(duplicated_coupon)
        });
        return(coupon_list)
    }

    function maxQuotaCoupon(){
        var quota=0;
        var idx=0;
        var chosen_coupons = document.querySelectorAll('div.coupon-item.chosen');
        chosen_coupons.forEach(function(coupon, i){
            if(Number(coupon.dataset.quota) > quota){
                quota = coupon.dataset.quota;
                idx = i;
            }
        })
        return(chosen_coupons[idx])
    }

    function createPlanItemList(quota){
        function addCheckedItems(){
            checked_items.forEach(function(item){
                balance += getItemSum(item);
                plan_items.push(item);
            })
        }

        function addSortedItemsNotExceedQuota(){
            for (let i = 0; i < sorted_items.length; i++) {
                item = sorted_items[i];
                if(balance + getItemSum(item) > quota){
                exceeded_items.push(item);
                    continue;
                }else{
                    balance += getItemSum(item);
                    console.log(balance);
                    plan_items.push(item);
                }
            }
        }

        function getExceedItemJustReachQuotaDescending(){
            if(plan_items.length == checked_items.length){
                return {'balance': Infinity, 'items':[]}
            }
            var new_balance = balance - getItemSum(plan_items[checked_items.length]);
            for (var i = (exceeded_items.length - 1) ; i > 0; i--) {
                if(new_balance + getItemSum(exceeded_items[i]) > quota){
                    break
                }
            }
            new_balance = new_balance + getItemSum(exceeded_items[i]);
            return({'balance':new_balance, 'items':[exceeded_items[i]]})
        }

        function getExceedItemJustReachQuotaAscending(){
            if(plan_items.length == checked_items.length){
                return {'balance': Infinity, 'items':[]}
            }
            var new_balance = balance - getItemSum(plan_items[checked_items.length]);
            var items = []
            for (var i = 0 ; i < exceeded_items.length; i++) {
                if(new_balance > quota){
                    break
                }else{
                    items.push(exceeded_items[i])
                }
                new_balance = new_balance + getItemSum(exceeded_items[i])
            }
            return({'balance':new_balance, 'items':items})
        }

        function getLastExceedItem(){
            var last_item = exceeded_items.slice(-1).pop();
            return({
                "balance": balance + getItemSum(last_item),
                "items": [last_item]
            })
        }


        var plan_item_list = document.createElement('div')
        plan_item_list.className = 'coupon-plan-item-list';
        var plan_items = [];
        var checked_items = [].slice.call(document.querySelectorAll('.item-item.item-seleted'))
        var sorted_items = [].slice.call(document.querySelectorAll('div.item-item:not(.hidden)')).sort(function(a, b){
            return(getItemSum(a) < getItemSum(b) ? 1 : -1);
        }).filter(function(item){
            return(!checked_items.map(function(i){return(i.id)}).includes(item.id));
        });

        var balance = 0;

        addCheckedItems();
        var exceeded_items = [];
        var item;
        addSortedItemsNotExceedQuota();
        if(exceeded_items.length > 0 && quota > balance){
            var candidate_exceed_items_desc = getExceedItemJustReachQuotaDescending();
            var candidate_exceed_items_asce = getExceedItemJustReachQuotaAscending();
            var last_exceed_item = getLastExceedItem();
            var plan_chooser = [
                balance,
                last_exceed_item.balance,
                candidate_exceed_items_desc.balance,
                candidate_exceed_items_asce.balance
            ].map(x => Math.abs(quota - x))
            switch(plan_chooser.indexOf(Math.min(...plan_chooser))){
                case 0:
                    break;
                case 1:
                    balance = last_exceed_item.balance;
                    plan_items = [...plan_items, ...last_exceed_item.items]
                    break;
                case 2:
                    balance = candidate_exceed_items_desc.balance;
                    plan_items.splice(checked_items.length, 1)
                    plan_items = [...plan_items ,...candidate_exceed_items_desc.items]
                    break;
                case 3:
                    balance = candidate_exceed_items_asce.balance;
                    plan_items.splice(checked_items.length, 1)
                    plan_items = [...plan_items ,...candidate_exceed_items_asce.items]
                    break;
            }
        }

        plan_items.forEach(function(item){
            plan_item_list.appendChild(createItemPlan(item))
        })
        plan_item_list.dataset.balance = balance;
        plan_item_list.dataset.quota = quota;
        return(plan_item_list)
    }

    function buildJdAPI(functionId, appid, bodyBuilder, callback){
        return function(args){
            var data = {
                'functionId': functionId,
                'appid': appid,
                'body': JSON.stringify(bodyBuilder(args)),
            }

            GM_xmlhttpRequest({
                url: 'https://api.m.jd.com/api',
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    'referer': 'https://cart.jd.com/'
                },
                data: data2query(data),
                responseType: "json",
                onload: function(response){
                    if(response.response === undefined || response.response.code){
                        notify('❌请求失败')
                        return
                    }
                    callback(response.response)
                }
            });
        };
    }

    var cartCouponList = buildJdAPI('pcCart_jc_cartCouponList', 'JDC_mall_cart', buildCouponListBody, appendCoupon)

    function getAllVenderCoupons(response){
        response.resultData.cartInfo.vendors.forEach(function(vendor, i){
            if(vendor.hasCoupon){
                  setTimeout(() => {
                      console.log(vendor.vendorId)
                      cartCouponList(vendor);
                  }, i* INTERVAL);
            }
        })
    }

    var getCurrentCartCoupon = buildJdAPI('pcCart_jc_getCurrentCart', 'JDC_mall_cart', buildCurrentCartBody, getAllVenderCoupons)

    window.addEventListener('load', function () {

    var get_coupon_list_button = document.createElement('button');
    get_coupon_list_button.className = 'coupon-filter-btn';
    get_coupon_list_button.textContent = '列出可用优惠券';
    document.querySelector('div.cart-filter-bar').insertAdjacentElement('afterend', get_coupon_list_button);

    get_coupon_list_button.addEventListener('click', function () {
        if(!this.parentElement.querySelector('div.coupon-filter')){
            var filter_box = document.createElement('div');
            filter_box.className = 'coupon-filter';
            this.insertAdjacentElement('afterend', filter_box);
        }
        getCurrentCartCoupon(null)

        if(!this.parentElement.querySelector('div.coupon-planer')){
            var planer_box = document.createElement('div');
            planer_box.className = 'coupon-planer';
            document.querySelector('div.coupon-filter').insertAdjacentElement('afterend', planer_box);
            var uncheck_button = document.createElement('button');
            uncheck_button.textContent = '取消选中所有商品';
            uncheck_button.addEventListener('click', function(){
                unsafeWindow.CartAction('OPT_CARTCHECKUNALL')
            });
            planer_box.appendChild(uncheck_button);

            var plan_button = document.createElement('button');
            plan_button.textContent = '生成用券方案';
            plan_button.addEventListener('click', function(){
                if(document.querySelectorAll('div.coupon-item.chosen').length == 0){
                    notify("请先选择要使用的券")
                    return
                }
                var plan = document.createElement('div');
                plan.className = 'coupon-plan';
                var max_coupon = maxQuotaCoupon();
                plan.appendChild(createPlanRemover());
                plan.appendChild(createCouponList());
                plan.appendChild(createPlanCheckbox());
                var plan_item_list = createPlanItemList(max_coupon.dataset.quota);
                plan.appendChild(plan_item_list)
                plan.appendChild(createPlanNotes(plan_item_list, max_coupon));
                planer_box.appendChild(plan);
            });
            planer_box.appendChild(plan_button)
        }
    })
    });

})();