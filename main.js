const {app, BrowserWindow,ipcMain,shell,dialog,Menu} = require('electron');
const _ = require('lodash');
const path = require('path');
const LokiDB = require('lokijs');
const fs = require('fs');
const util = require('util');
const access = util.promisify(fs.access);


class Download {
    constructor(){
        this.mainWindow = null;
        this.itemsCollection;
        this.db;
        this.ipcMainListenerArray = [];
        this.initAppListener();
    }

    removeIpcMainListeners(ipcMainListenerArray){
        _.each(ipcMainListenerArray,(value)=>{
            ipcMain.removeAllListeners(value)
        })
    }

    databaseInitialize(db){
        let entries = db.getCollection("download");
        if (entries === null) {
          entries = db.addCollection("download");
        }
        return entries
    }

    createWindow(isActive){
        let windowOpts = {
            width : 800,
            height :600
            // show:false
        };
        this.mainWindow = new BrowserWindow(windowOpts);
        let url = path.join('file://', __dirname, '/index.html');
        this.mainWindow.loadURL(url);
        this.mainWindow.on('closed',() => {
            console.log(ipcMain.listenerCount('will-download'))
            this.removeIpcMainListeners(this.ipcMainListenerArray)
            console.log(ipcMain.listenerCount('will-download'))
            this.mainWindow = null;
        });
        this.initReceiveListener(isActive);
        if(!isActive){
            this.registerDownloadListener(this.mainWindow);
        }
        this.mainWindow.once('ready-to-show', () => {
            console.log(!isActive,"!isActive")
            if(!isActive){
                let allDownloadItemsInfos = this.itemsCollection.find({})
                this.mainWindow.webContents.send('initAlldownloaditems',allDownloadItemsInfos)
                this.mainWindow.show()
            }else{
                this.mainWindow.show()
            }
           
        })
    }

    initAppListener(){
        app.on('ready',() => {
          this.db = new LokiDB('download',{
            autoload:true,
          });
          //初始化db
          this.db.addListener('loaded',event => {
            this.itemsCollection = this.databaseInitialize(this.db)
            this.createWindow()
          })
        });
        app.on('window-all-closed',() =>{
          if (process.platform !== 'darwin') {
            app.quit()
          }
        });
        app.on('activate', () => {
          if (this.mainWindow === null) {
            this.createWindow(true)
          }
        })
    }

    initWebContentListener(){
        this.mainWindow.webContents.on('dom-ready',()=>{
            let allDownloadItemsInfos = this.itemsCollection.find({})
            this.mainWindow.webContents.send('initAlldownloaditems',allDownloadItemsInfos)
        })
    }

    initReceiveListener(isActive){
        //刷新页面时候加载已有数据
        this.mainWindow.webContents.on('dom-ready',()=>{
            console.log('reload!!!!!!')
            let allDownloadItemsInfos = this.itemsCollection.find({})
            if(!isActive){
                this.mainWindow.webContents.send('initAlldownloaditems',allDownloadItemsInfos,true)
            }else{
                this.mainWindow.webContents.send('initAlldownloaditems',allDownloadItemsInfos)
            }
          })
        //删除下载页面的数据
        ipcMain.on('removedowanload',(event,id)=>{
          this.itemsCollection.chain().find({itemid:id}).remove();
          this.db.save();
        });
        this.ipcMainListenerArray.push('removedowanload')
        //断点下载时没有downloaditem时做取消
        ipcMain.on('cancelinterrupted',(event,id)=>{
          var cancelinterruptedupdate = function(obj){
            obj.state = 'isCancelled';
            return obj
          }
          this.itemsCollection.findAndUpdate({itemid:id},cancelinterruptedupdate);
          this.db.save();
        })
        this.ipcMainListenerArray.push('cancelinterrupted');
        //接受页面点击事件继续断点下载
        ipcMain.on('reload',(event,id)=>{
          let interruptedItemsInfos = this.itemsCollection.find({itemid:id})
          let downloaditem = interruptedItemsInfos[0].downloaditem
          let opts = {
            path : interruptedItemsInfos[0].savePath,
            urlChain : downloaditem.URLChain,
            mimeType :downloaditem.mimeType,
            offset : downloaditem.offset,
            // offset : downloaditem.receivedBytes,
            length : downloaditem.totalBytes,
            lastModified : downloaditem.lastModifiedTime,
            eTag : downloaditem.Etag,
            startTime : downloaditem.startTime
          }
          console.log('reloadopts',opts)
          this.restoreDownload(opts);
        });
        this.ipcMainListenerArray.push('reload');
        //下载完成后接受页面点击打开文件夹事件
        ipcMain.on('openDir',(event,arg,filename)=>{
          let fileurl = app.getPath('downloads')+'/' + filename;
          shell.showItemInFolder(fileurl)
        })
        this.ipcMainListenerArray.push('openDir');

        ipcMain.on('startdownload',(event, downloadURL) => {
            // "https://dldir1.qq.com/qqfile/QQIntl/QQi_PC/QQIntl2.11.exe"
            // "http://dldir1.qq.com/qqfile/QQforMac/QQ_V6.4.0.dmg"  testurl
            this.mainWindow.webContents.downloadURL(downloadURL)
        });
        this.ipcMainListenerArray.push('startdownload');
    }

    restoreDownload(options){
        console.log('i am reload')
        this.mainWindow.webContents.session.createInterruptedDownload(options)
    }

     registerDownloadListener (){
        this.mainWindow.webContents.session.on('will-download', (event, item, webContents)=>{
            this.checkDownloadURLexist(event,item);
            let savePathforCheck = `${app.getPath('downloads')}/${item.getFilename()}`
            let savePath = this.checkFileName(item,savePathforCheck);
            //断点下载的item初始状态为interrupted

            console.log(item.getSavePath(),"getSavePath");
            if(item.getState() === 'interrupted'){
                console.log("item:",item.getETag())
                console.log('i am starting ')
                let reloadflag = true;
                // let itemId = item.getStartTime()*1000000;
                //let savePath = this.itemsCollection.find({itemid:itemId})[0].savePath;
                //console.log(savePath,"savePath")
               // item.setSavePath(savePath)
               this.goOnInterruptedDownload(event, item, webContents,savePath,reloadflag)
            }else{
                console.log('new download');
                let reloadflag = false;
                this.firstDownload(event, item, webContents,savePath,reloadflag)
            }

        })
    }

    checkDownloadURLexist(event,item){
        if(item.getTotalBytes() === 0 ){
            let opts = {type:'warning',message:"wrong downloadUrl"}
            let win = this.mainWindow
            dialog.showMessageBox(win,opts)
            event.preventDefault()
            return
        }
        
       
    }

     checkFileName(item,savePathforCheck,count = 0){
        //检查dowload文件夹中是否存在
        try{
            fs.accessSync(savePathforCheck, fs.constants.F_OK)
            savePathforCheck = `${app.getPath('downloads')}/(${++count})${item.getFilename()}`
            // console.log("savePathforCheck:",savePathforCheck)
            return checkFileName(item,++count)
        }catch(err){
            // console.log(savePathforCheck,"savePathforCheck")
            return savePathforCheck
        }
        
    }

    goOnInterruptedDownload(event, item, webContents,savePath,reloadflag){
        let newName = savePath.split('/')[savePath.split('/').length-1]
        let itemId = item.getStartTime()*1000000;//开始时间作为下载项目唯一主键
        let downloadItemInfos = this.itemsCollection.find({itemid:itemId})[0];//从数据库中拿需要断点继续下载的item
        let offset = downloadItemInfos.downloaditem.receivedBytes; //获取断点时已下载点字节数
        let startInterrupteTime = new Date().getTime()/1000 //获取继续断点下载的开始时间
        let isReload = true;
        let argsForWin = this.getDowanloadInfos(item);
        
        // argsForWin.isReload = isReload;
        item.resume();//恢复断点下载
        // item.setSavePath(savePath)
        this.mainWindow.webContents.send('isDownloading',argsForWin,isReload)
        let argsforDownload = {
            item:item,
            itemId:itemId,
            startInterrupteTime:startInterrupteTime,
            offset:offset,
            savePath:savePath,
            reloadflag:reloadflag
        }
        this.listenToOneItem(argsforDownload)
    }

    firstDownload(event, item, webContents,savePath,reloadflag){
        let newName = savePath.split('/')[savePath.split('/').length-1]
        console.log(savePath,'savePath')
        console.log(newName,"newName")
        let downloadItemInfos = this.getDowanloadInfos(item);
        let itemId = downloadItemInfos.startTime*1000000;
        let itemState = downloadItemInfos.state;
        downloadItemInfos.newName = newName; //有重复命名添加新字段更新保存
        //第一次下载的item存入数据库
        let firstDownloadItem = this.itemsCollection.insert({itemid:itemId,savePath:savePath,state:itemState,downloaditem:downloadItemInfos})
        item.setSavePath(savePath)
        this.db.save()
        let argsForWin = downloadItemInfos;
        this.mainWindow.webContents.send('isDownloading',argsForWin);
        let argsforDownload = {
            item:item,
            itemId:itemId,
            firstDownloadItem:firstDownloadItem,
            savePath:savePath,
            reloadflag:reloadflag
        };
        this.listenToOneItem(argsforDownload)
    }

    listenToOneItem ({item,itemId,firstDownloadItem='',startInterrupteTime='',offset='',savePath,reloadflag}) {
        this.addDownloadingItemEvent(item,itemId);
        let args= {
            item:item,
            itemId:itemId,
            firstDownloadItem:firstDownloadItem,
            startInterrupteTime:startInterrupteTime,
            offset:offset,
            savePath:savePath,
            reloadflag,reloadflag
        }
        this.listenDownloadingItem(args)
    }

    addDownloadingItemEvent (item,itemId) {
        ipcMain.on('cancelDownload',(event,winitemId)=>{
            if(!item.isDestroyed()){
              if(itemId === winitemId){
                item.cancel()
              }
            }
          });
        ipcMain.on('continueDownload',(event,winitemId)=>{
        if(itemId === winitemId){
            item.resume()
        }
        
        });
        ipcMain.on('pauseDownload',(event,winitemId)=>{
        if(itemId === winitemId){
            item.pause()
        }
        }); 
        app.on('will-quit',()=>{
        if(!item.isDestroyed()){
            item.pause()
        }
        });
    }

    listenDownloadingItem({item,itemId,firstDownloadItem='',startInterrupteTime='',offset='',savePath,reloadflag}){
        item.on('done',(event,state)=>{
            console.log('done      !');
            let argsForWin = this.getDowanloadInfos(item)
            if(state === 'completed'){
                if(reloadflag){
                    this.interruptedDownloadItemOver(itemId,argsForWin)
                }else{
                    this.firstDownloadItemOver(firstDownloadItem,argsForWin)
                }
            }else{
                if(reloadflag){
                    this.interruptedDownloadItemCanceled(itemId,argsForWin)
                }else{
                    this.firstDownloadItemCanceled(firstDownloadItem,argsForWin)
                }
            }
        })
        item.on('updated',(event,state)=>{
            let downloadingItemInfos = this.getDowanloadInfos(item)
            if(state === 'interrupted'){
               // item.resume() // 断点下载开始
            }else if(state === 'progressing'){
                if (item.isPaused()){
                    if(reloadflag){
                        this.interruptedDownloadItemPaused(itemId,downloadingItemInfos)
                    }else{
                        this.firstDownloadItemPaused(firstDownloadItem,downloadingItemInfos)
                    }
                }else{
                    console.log(`Received bytes: ${item.getReceivedBytes()}`)
                    if(reloadflag){
                        this.interruptedDownloadItemProccessing(itemId,downloadingItemInfos,startInterrupteTime,offset)
                    }else{
                        this.firstDownloadItemProccessing(firstDownloadItem,downloadingItemInfos)
                    }
                }
            }else{
                console.log('err')
            }
        })
    }

    firstDownloadItemProccessing(firstDownloadItem,downloadingItemInfos){
        firstDownloadItem.downloaditem = downloadingItemInfos;
        let startTime = downloadingItemInfos.startTime;
        let receivedBytes = downloadingItemInfos.receivedBytes;
        let fileUrl = downloadingItemInfos.url;
        let filename = downloadingItemInfos.filename;
        let filesize = downloadingItemInfos.totalBytes;
        let hasDownloadedBytes = 0;
        hasDownloadedBytes += receivedBytes;
        firstDownloadItem.downloaditem.offset = downloadingItemInfos.Etag != ""? hasDownloadedBytes : 0;
        firstDownloadItem.state = 'isProgressing'
        let speed = receivedBytes/(Number(new Date().getTime()/1000) - Number(startTime))
        this.itemsCollection.update(firstDownloadItem)
        this.db.save()
        if(this.mainWindow){
            this.mainWindow.webContents.send('receivedBytes',receivedBytes,speed,hasDownloadedBytes,startTime,fileUrl,filename,filesize)
        }
    }

    interruptedDownloadItemProccessing(itemId,downloadingItemInfos,startInterrupteTime,offset){
        let startTime = downloadingItemInfos.startTime;
        let filesize = downloadingItemInfos.totalBytes;
        let filename = downloadingItemInfos.filename;
        let fileUrl = downloadingItemInfos.url; 
        let receivedBytes = downloadingItemInfos.receivedBytes;
        let hasDownloadedBytes = offset;
        // let nowDowaload = 0;
        // nowDowaload += receivedBytes;
        // hasDownloadedBytes += receivedBytes;
        downloadingItemInfos.offset = downloadingItemInfos.Etag != ""? hasDownloadedBytes : 0;
        let speed = receivedBytes/(Number(new Date().getTime()/1000) - Number(startInterrupteTime))
        var update = function (obj){
            obj.state = 'isProgressing';
            obj.downloaditem = downloadingItemInfos 
            return obj
          }
        this.itemsCollection.findAndUpdate({itemid:itemId},update)
        this.db.save()
        if(this.mainWindow){
            this.mainWindow.webContents.send('receivedBytes',receivedBytes,speed,hasDownloadedBytes,startTime,fileUrl,filename,filesize)
        }
    }

    //把第一次下载暂停时的状态写入数据库
    firstDownloadItemPaused(firstDownloadItem,downloadingItemInfos){
        let hasDownloadedBytes = 0
        hasDownloadedBytes += downloadingItemInfos.receivedBytes;
        downloadingItemInfos.hasDownloadedBytes = hasDownloadedBytes;
        // let receivedBytes = downloadingItemInfos.receivedBytes
        firstDownloadItem.state = 'interrupted';
        firstDownloadItem.downloaditem.offset = downloadingItemInfos.Etag != ""? hasDownloadedBytes : 0;
        if(this.mainWindow){
            this.mainWindow.webContents.send('isPaused',downloadingItemInfos)
        }
        this.itemsCollection.update(firstDownloadItem)
        this.db.save()
    }
    //把断点下载暂停时的状态写入数据库
    interruptedDownloadItemPaused(itemId,downloadingItemInfos){
        let receivedBytes = downloadingItemInfos.receivedBytes;
        let hasDownloadedBytes = downloadingItemInfos.offset;
        hasDownloadedBytes += receivedBytes;
        downloadingItemInfos.offset = (downloadingItemInfos.Etag != "" ? hasDownloadedBytes : 0);
        var pasueupdate = function(obj){
          obj.state = 'interrupted';
          obj.downloaditem = downloadingItemInfos;
          return obj
        }
        this.itemsCollection.findAndUpdate({itemid:itemId},pasueupdate)
        this.db.save()
    }

    firstDownloadItemOver(firstDownloadItem,argsForWin){
        firstDownloadItem.state = 'isCompleted';
        this.itemsCollection.update(firstDownloadItem); //把数据库中的对应数据state改为isCompleted
        this.db.save();
        if(this.mainWindow){
         this.mainWindow.webContents.send('completed',argsForWin)//通知窗口完成
        }
    }

    interruptedDownloadItemOver(itemId,argsForWin){
        var cancelupdate = function(obj){
            obj.state = 'isCompleted';
            return obj
        }
        this.itemsCollection.findAndUpdate({itemid:itemId},cancelupdate); //把数据库中的对应数据state改为isCompleted
        this.db.save();
        if( this.mainWindow){
            this.mainWindow.webContents.send('completed',argsForWin)//通知窗口完成
        }
    }

    firstDownloadItemCanceled(firstDownloadItem,argsForWin){
        firstDownloadItem.state = 'isCancelled';
        this.itemsCollection.update(firstDownloadItem) //把数据库中的对应数据state改为isCancelled
        this.db.save()
        if(this.mainWindow){
            this.mainWindow.webContents.send('cancelled',argsForWin) //通知窗口取消下载
        }
    }
    interruptedDownloadItemCanceled(itemId,argsForWin){
        var cancelupdate = function(obj){
            obj.state = 'isCancelled';
            return obj
        }
        this.itemsCollection.findAndUpdate({itemid:itemId},cancelupdate) //把数据库中的对应数据state改为isCancelled
        this.db.save()
        if(this.mainWindow){
            this.mainWindow.webContents.send('cancelled',argsForWin)//通知窗口取消下载
        }
    }

    //下载项目的信息
    getDowanloadInfos(downloadItem){
        let startTime = downloadItem.getStartTime();
        let Etag = downloadItem.getETag();
        let lastModifiedTime = downloadItem.getLastModifiedTime();
        let URLChain = downloadItem.getURLChain();
        let state = downloadItem.getState();
        let contentDisposition = downloadItem.getContentDisposition();
        let receivedBytes = downloadItem.getReceivedBytes();
        let totalBytes = downloadItem.getTotalBytes();
        let filename = downloadItem.getFilename();
        let mimeType = downloadItem.getMimeType();
        let url = downloadItem.getURL(); 
        return {
          startTime:startTime,
          Etag:Etag,
          lastModifiedTime:lastModifiedTime,
          URLChain:URLChain,
          state:state,
          contentDisposition:contentDisposition,
          receivedBytes:receivedBytes,
          totalBytes:totalBytes,
          filename:filename,
          mimeType:mimeType,
          url:url,
          offset:null
        }
      }

}

new Download()