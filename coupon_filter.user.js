// ==UserScript==
// @name         coupon_filter
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  filter item by coupons
// @author       Gahoo
// @match        https://cart.jd.com/cart_index
// @connect      api.m.jd.com
// @grant        GM_xmlhttpRequest
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

    document.querySelector('div.cart-filter-bar').addEventListener('click', function () {
        if(!this.parentElement.querySelector('div.coupon-filter')){
            var filter_box = document.createElement('div');
            filter_box.className = 'coupon-filter';
            this.insertAdjacentElement('afterend', filter_box);
        }
        getCurrentCartCoupon(null)
    })
    });

})();