// ==UserScript==
// @name         smzdm4jd
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://cart.jd.com/cart_index
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.2/rollups/md5.js
// @connect      dingyue-api.smzdm.com
// @grant        GM_xmlhttpRequest

// ==/UserScript==

(function() {
    'use strict';
    //smzdm key goes here
    const smzdm_key = "";
    var style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = `
      .smzdm.high {color: red;}
      .smzdm.low {color: green;}
      span.smzdm {
          position: relative ;
      }

      span.smzdm.price:hover::after {
          content: attr(data-tooltip) ;
          position: absolute ;
          bottom: 1.2em ;
          right: -1em ;
          border: 1px grey solid ;
          padding: 2px ;
          background-color: white ;
          z-index: 1 ;
      }
    `;
    document.head.appendChild(style);

    function currentTime(){
        return((Date.now() / 1000).toFixed(0) * 1000)
    };

    function appendPrice(item, response){
        var price_info = item.querySelector('div.p-price')
        response.data.tags.forEach(tag => {
            var smzdm = document.createElement('p');
            smzdm.className = "smzdm";
            var price = document.createElement('span');
            price.className = "smzdm price"
            if(tag.url){
                var link = document.createElement('a');
                link.textContent = tag.title + ': ';
                link.href = tag.url;
                link.target = "_blank";
                price.textContent = tag.price;
                price.setAttribute('data-tooltip', tag.modify_time);
                smzdm.appendChild(link);
                smzdm.append(price);
            }else{
                price.textContent = tag.price;
                price.setAttribute('data-tooltip', tag.modify_time);
                smzdm.textContent = tag.title + ':';
                smzdm.append(price);
            }
            price_info.appendChild(smzdm);
        })
        console.log(response)
    };

    function appendLandedPrice(item, response){
        var price_info = item.querySelector('div.p-price')
        if(response.data.rows){
            var smzdm = document.createElement('p');
            smzdm.className = "smzdm";
            smzdm.textContent = "落地价:¥";
            var landed_price = document.createElement('span');
            landed_price.className = "smzdm landed-price";
            landed_price.textContent = response.data.rows[0].price;
            smzdm.appendChild(landed_price);
            price_info.appendChild(smzdm);
            item.querySelectorAll('span.smzdm.price').forEach(smzdm_price => {
                var percentage = Math.round(response.data.rows[0].price / smzdm_price.textContent.replace('¥', '') * 100);
                var price_percentage = document.createElement('span');
                price_percentage.className = 'smzdm percent';
                if(percentage > 100){
                    price_percentage.classList.add('high');
                }else if(percentage < 100){
                    price_percentage.classList.add('low');
                }
                price_percentage.textContent = '(' + percentage + '%)';
                smzdm_price.parentElement.appendChild(price_percentage);
            });
        }
        console.log(response)
    }

    function data2query(data){
        return(Object.entries(data)
            .map(([key, value]) => `${key}=${value}`)
            .join("&"));
    };

    function buildSign(data){
        //console.log(data2query(data))
        return(CryptoJS.MD5(data2query(data))
            .toString(CryptoJS.enc.Hex).toUpperCase());
    };

    function buildSmzdmAPI(api, callback){
        return function (url, args){
        const cur_time = currentTime();
        var data = {
                "f": "android",
                "time": cur_time,
                "url": url,
                "v": "10.2.31",
                "weixin": 1,
                "key": smzdm_key
            };
        const sign = buildSign(data);
        delete data.key;
        data.sign = sign;

        GM_xmlhttpRequest({
            url: api,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data: data2query(data),
            responseType: "json",
            onload: function(response) {
                args.push(response.response)
                callback.apply(null, args);
            }
        });
    };
    };

    var get_history_price = buildSmzdmAPI("https://dingyue-api.smzdm.com/dingyue/get_price_historys", appendPrice)
    var product_info = buildSmzdmAPI("https://dingyue-api.smzdm.com/dingyue/product_info", appendLandedPrice)


    window.addEventListener('load', function () {


    var checkboxes = document.querySelectorAll('input[type=checkbox][name="checkItem"]');
    console.log(checkboxes.length);

    checkboxes.forEach(function(checkbox) {
        checkbox.addEventListener('click', function() {
            if (this.checked) {
                var item = this.parentElement.parentElement.parentElement;
                var url = item.querySelector('a').href;
                console.log(url);
                if(item.querySelector('p.smzdm') === null){
                    get_history_price(url, [item]);
                    product_info(url, [item]);
                }
            }
        })
    });


    })
})();
