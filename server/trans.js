/**
 * Created by edel.ma on 6/28/17.
 */

const cheerio = require('cheerio'),
    async = require('async'),
    fs = require('fs'),
    URL = require('url'),
    path = require('path'),
    gh = require('../service/geo_helper');

const query = require('../service/query'),
    adapter = require('../service/adapter'),
    file = require('../service/file'),
    exporter = require('../service/exporter'),
    util = require('../service/util');

let MAX_THREAD = 20;

const fetchTrans = (url, auth, cb) => {
    url = util.urlNormalize(url);

    query.query(url, (err, res) => {
        if (!err) {
            let $, obj;
            try {
                $ = cheerio.load(res);
            }
            catch (e) {
                console.log(`\t[ X ] : Load response from ${url} failed, messages: ${e.message}`);
                $ = null;
            }

            if ($) {
                let desc = $("meta[name='Description']").attr('content') || $("meta[name='description']").attr('content');
                let ogDesc = $("meta[property='og:description']").attr('content');
                let ogUrl = $("meta[property='og:url']").attr('content');
                let _ogImage = $("meta[property='og:image']").attr('content');

                let ogTitle = $("meta[property='og:title']").attr('content');
                let ogImage, ogImage1, ogImageUS = 'NA';
                let title = $("title").text();
                let descUS,ogDescUS,ogUrlUS,ogTitleUS,titleUS,ogImageUScur='NA';
                if (_ogImage) {
                    _ogImage = _ogImage.split('?')[0];

                    let ogURLObj = URL.parse(_ogImage);
                    ogURLObj.host = URL.parse(url).host;
                    ogImage = URL.format(ogURLObj);

                    ogImage1 = _ogImage;
                }

                obj = {
                    url,
                    desc: desc,
                    ogDesc,
                    ogTitle,
                    ogImage: {
                        url: ogImage
                    },
                    title,
                    oglab: ogImage1,
                    geo : gh.getGEO(url),
                    ogUrl,
                    ogUrlUS,
                    ogImageUS,
                    descUS,
                    ogImageUScur



                };

                async.parallel([
                    callback => {
                        if (ogImage) {
                            file.getImageSizeByUrl(ogImage, (err, ogSize) => {
                                obj.ogImage.size = err ? {} : ogSize;
                                callback(err)
                            }, auth);
                        } else {
                            obj.ogImage.size = {};
                            callback(null);
                        }
                    },
                    callback => {
                        adapter.wechatHandler(res, (err, wechat_url) => {
                            if (!err && wechat_url) {
                                wechat_url = URL.resolve(url, wechat_url);

                                file.getImageSizeByUrl(wechat_url, (err, wechat_size) => {
                                    obj.wechat = {
                                        url: wechat_url,
                                        size: err ? {} : wechat_size
                                    };
                                    callback(err);
                                }, auth);
                            } else {
                                obj.wechat = {
                                    url: null,
                                    size: {}
                                };
                                callback(err);
                            }
                        }, auth)
                    },
                    callback => {
                        if(_ogImage){
                            if(gh.getGEO(url) !== 'US'){
                                let tempUrl = gh.geo2us(url, true);

                                query.query(tempUrl, (err, data) => {
                                    if(!err){
                                        let $ = cheerio.load(data);
                                        ogImageUS = $("meta[property='og:image']").attr('content');
                                        if(ogImageUS){
                                            ogImageUS = ogImageUS.split('?')[0];

                                            /*add US image on current server*/
                                            let ogURLObj1 = URL.parse(ogImageUS);
                                            ogURLObj1.host = URL.parse(url).host;
                                            ogImageUScur = URL.format(ogURLObj1);
                                        }

                                        obj['ogImageUS'] = ogImageUS;
                                        obj['ogImageUScur']=ogImageUScur;

                                        callback(null);
                                    }else{
                                        callback(err);
                                    }
                                }, auth);
                            }else{
                                ogImageUS = _ogImage;
                                callback(null);
                            }
                        }else{
                            callback(null);
                        }
                    },
                    callback => {
                        if(true){
                            if(gh.getGEO(url) !== 'US'){
                                let tempUrl = gh.geo2us(url, true);

                                query.query(tempUrl, (err, data) => {
                                    if(!err){
                                        let $ = cheerio.load(data);
                                        descUS = $("meta[name='Description']").attr('content');
                                        ogDescUS=$("meta[property='og:description']").attr('content');
                                        ogUrlUS=$("meta[property='og:url']").attr('content');
                                        ogTitleUS=$("meta[property='og:title']").attr('content');
                                        titleUS=$("title").text();

                                        obj['descUS'] = descUS;
                                        obj['ogDescUS']=ogDescUS;
                                        obj['ogUrlUS']=ogUrlUS;
                                        obj['ogTitleUS']=ogTitleUS;
                                        obj['titleUS']=titleUS;
                                        callback(null);
                                    }else{
                                        callback(err);
                                    }
                                }, auth);
                            }else{
                                descUS = desc;
                                ogDescUS =ogDesc;
                                ogUrlUS=ogUrl;
                                ogTitleUS=ogTitle;
                                titleUS=title;

                                callback(null);
                            }
                        }else{
                            callback(null);
                        }
                    },



                ], function (err) {
                    if (err) {
                        console.log(`\t[ X ] : Fetching shared images on ${url} failed, with an error of ${err.message}`);
                    }
                    cb(err, obj);
                });
            } else {
                obj = {
                    url,
                    desc: "Bad Link",
                    ogDesc: "NA",
                    title: 'NA',
                    ogTitle: 'NA',
                    ogUrl : 'NA',
                    ogImageUS : 'NA',
                    geo : gh.getGEO(url)
                };
                cb(null, obj);
            }
        } else {
            console.log(`\t[ X ] : Querying data from ${url} failed, with an error of ${err.message}`);
            let obj = {
                url,
                desc: "Bad Link",
                ogDesc: "NA",
                title: 'NA',
                ogTitle: 'NA',
                ogUrl : 'NA',
                ogImageUS : 'NA',
                geo : gh.getGEO(url)
            };
            cb(null, obj);
        }
    }, auth);
};

const runTask = (urlStr, auth, cb) => {
    let urlArr = urlStr.split('\n');
    async.mapLimit(urlArr, MAX_THREAD, (item, callback) => {
        fetchTrans(item, auth, (err, data) => {
            if (err) {
                console.log(`\t[ X ] : Doing meta check failed on ${item}`);
            }
            callback(null, data);
        })
    }, (err, res) => {
        cb(res);
    });
};

const dealHTML = (content, cb) => {
    const exportTime = new Date().getTime();
    const title = `report-${exportTime}`;
    const fileName = `${title}.html`;
    const exportPath = `./static/data/${fileName}`;

    let finalStr = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        .red {
            color : red;
        }
        .ext-thumb {
            width : 60px;
            height : 60px
        }
        .metaStyle > tr > td > div {
           width: 200px;
           height: 200px;
         word-wrap: break-word
}
    </style>
    <link rel="stylesheet" href="https://cdn.bootcss.com/bootstrap/3.3.7/css/bootstrap.min.css" integrity="sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u" crossorigin="anonymous">
</head>
<body class="container-fluid">
    <table class="table table-bordered table-striped table-hover">
    <caption align="top";color:black;>Meta Report</caption> 
    <tbody class="metaStyle">
        <tr>
            <th>URL</th>
            <th>Title</th>
            <th>Description</th>
            <th>OG Title</th>
            <th>OG Description</th>
            <th>OG Img</th>
            <th>OG Img label</th>
            <th>OG Img on Current Server</th>
            <th>WeChat Img</th>
            <th>WeChat URL</th>
        </tr>
        ${content.map(item => `
            <tr>
                <td><div><a href="${item.url}" target="_blank">${item.url}</a></div></td>
                <td><div>${item.title}</div></td>
                <td${item.desc && (item.desc.length > 150 || item.desc.length < 100) ? " class='red'" : ""}><div>${item.desc}</div></td>
               
                <td><div>${item.ogTitle}</div></td>
                <td${item.ogDesc && (item.ogDesc.length > 150 || item.ogDesc.length < 100) ? " class='red'" : ""}><div>${item.ogDesc}</div></td>
                <td class="text-center"><div><img src="${item.ogImage.url}" alt="ogImage" class="ext-thumb"><br>
                Width:${item.ogImage.size.width}.Hight:${item.ogImage.size.height}</div></td>
                <td><div><a href="${item.oglab}" target="_blank">${item.oglab}</a></div></td>
                <td><div><a href="${item.ogImage.url}" target="_blank">${item.ogImage.url} </div></td>
                <td class="text-center"><div><img src="${item.wechat.url}" alt="wachatImage" class="ext-thumb"><br>
                <br>
                Width:${item.wechat.size.width}.Hight:${item.wechat.size.height}</div></td>
                <td><div><a href="${item.wechat.url}" target="_blank">${item.wechat.url}</div></td>
            </tr>
        `).join('')}
        </tbody>
    </table>
</body>
</html>
    `;

    fs.writeFileSync(exportPath, finalStr, 'utf-8');

    cb(null, fileName);
};

const dealExcel = (content, cb) => {
    const headers = {
        url: 'URL',
        title: 'Title',
        desc: 'Description',
        ogTitle: 'OG Title',
        ogDesc: 'OG Description',
    };
    exporter.dealExcel(headers, content, cb);
};

const export2Xls = (obj, cb) => {
    switch (obj.type) {
        case "html" :
            dealHTML(obj.xls, cb);
            break;
        default:
            dealExcel(obj.xls, cb);
    }
};

exports.runTask = runTask;
exports.export2Xls = export2Xls;