const {app, BrowserWindow,ipcMain,shell,dialog,Menu} = require('electron');
const _ = require('lodash');
const path = require('path');
const LokiDB = require('lokijs');

class Download {
    constructor(){
        this.mainWindow = null;
        this.itemsCollection;
        this.db;
        this.ipcMainListenerArray = [];
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
            height :600,
            show:false
        };
        this.mainWindow = new BrowserWindow(windowOpts);
        let url = path.join('file://', __dirname, '/clientDownloadnew/index.html');
        this.mainWindow.loadURL(url);
        this.mainWindow.on('closed',() => {
            this.removeIpcMainListeners(this.ipcMainListenerArray)
            this.mainWindow = null;
        });
        this.initReceiveInfo(this.mainWindow);
        if(!isActive){
            this.listenToDownload(this.mainWindow);
        }
        this.mainWindow.once('ready-to-show', () => {
            let allDownloadItemsInfos = this.itemsCollection.find({})
            this.mainWindow.webContents.send('initAlldownloaditems',allDownloadItemsInfos)
            this.mainWindow.show()
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
            //刷新页面时候加载已有数据
            let allDownloadItemsInfos = this.itemsCollection.find({})
            this.mainWindow.webContents.send('initAlldownloaditems',allDownloadItemsInfos)
        })
    }

    initReceiveListener(){
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
            path : downloaditem.url,
            urlChain : downloaditem.URLChain,
            mimeType :downloaditem.mimeType,
            offset : downloaditem.offset,
            length : downloaditem.totalBytes,
            lastModified : downloaditem.lastModifiedTime,
            eTag : downloaditem.Etag,
            startTime : downloaditem.startTime
          }
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
        this.mainWindow.webContents.session.createInterruptedDownload(options)
    }

    registerDownloadListener (){
        this.mainWindow.webContents.on('will-download',(event, item, webContents)=>{
            this.checkDownloadURLexist(event, item, webContents);
            let savePath = this.checkFileName(event, item, webContents);
            //断点下载的item初始状态为interrupted
            if(item.getState() === 'interrupted'){
                let reloadflag = true;
                goOnInterruptedDownload(event, item, webContents,savePath,reloadflag)
            }else{
                let reloadflag = flase;
                firstDownload(event, item, webContents,savePath,reloadflag)
            }

        })
    }

    checkDownloadURLexist(event, item, webContents){
        if(item.getTotalBytes() === 0 ){
            let opts = {type:'warning',message:"wrong downloadUrl"}
            dialog.showMessageBox(win,opts)
            event.preventDefault()
            return
        }
        
       
    }

    checkFileName(event, item, webContents){
        //检查dowload文件夹中是否存在
        let savePath = app.getPath('downloads')+ '/' + item.getFilename()
        return savePath
    }

    goOnInterruptedDownload(event, item, webContents,savePath,reloadflag){
        let itemId = item.getStartTime()*1000000;//开始时间作为下载项目唯一主键
        let downloadItemInfos = this.itemsCollection.find({itemid:start})[0];//从数据库中拿需要断点继续下载的item
        let hasDownloadedBytes = downloadItemInfos.offet; //获取断点时已下载点字节数
        let startInterrupteTime = new Date().getTime()/1000 //获取继续断点下载的开始时间
        let isReload = true;
        let argsForWin = this.getDowanloadInfos(item);
        argsForWin.isReload = isReload;
        item.resume();//恢复断点下载
        item.setSavePath(savePath)
        this.mainWindow.webContents.send('isDownloading',argsForWin)
        let argsforDownload = {
            item:item,
            itemId:itemId,
            startInterrupteTime:startInterrupteTime,
            hasDownloadedBytes:hasDownloadedBytes,
            savePath:savePath,
            reloadflag:reloadflag
        }
        this.listenToOneItem(argsforDownload)
    }

    firstDownload(event, item, webContents,savePath,reloadflag){
        let downloadItemInfos = this.getDowanloadInfos(item);
        let itemId = downloadItemInfos.startTime*1000000;
        let itemState = downloadItemInfos.state;
        //第一次下载的item存入数据库
        let firstDownloadItem = this.itemsCollection({itemid:itemId,state:itemState,downloaditem:downloadItemInfos})
        item.setSavePath(savePath)
        this.db.save()
        let argsForWin = this.getDowanloadInfos(item);
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

    listenToOneItem ({item,itemId,firstDownloadItem='',startInterrupteTime='',hasDownloadedBytes='',savePath,reloadflag}) {
        this.addDownloadingItemEvent(item,itemId);
        this.listenDownloadingItem({item,itemId,firstDownloadItem='',startInterrupteTime='',hasDownloadedBytes='',savePath,reloadflag})
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
        app.on('window-all-closed',() =>{
            if (process.platform !== 'darwin') {
                app.quit()
            }
            if(!downloaditem.isDestroyed()){
                item.pause()
            }
        });
    }

    listenDownloadingItem({item,itemId,firstDownloadItem='',startInterrupteTime='',hasDownloadedBytes='',savePath,isReload}){
        item.on('done',(event,state)=>{
            if(state === 'completed'){
                let argsForWin = this.getDowanloadInfos(item)
                if(isReload){
                    this.interruptedDownloadItemOver(itemId,argsForWin)
                }else{
                    this.firstDownloadItemOver(itemId,argsForWin)
                }
            }else if(state === 'cancelled'){
                if(isReload){

                }else{

                }
            }else{
                if(isReload){

                }else{
                    
                }
            }
        })
        item.on('updated',(event,state)=>{
            if(state === 'interrupted'){

            }else if(state === 'progressing'){
                if (item.isPaused()){

                }else{

                }
            }else{

            }
        })
    }

    firstDownloadItemOver(itemId,argsForWin){
        var cancelupdate = function(obj){
                obj.state = 'isCompleted';
                return obj
            }
        this.itemsCollection.findAndUpdate({itemid:itemId},cancelupdate); //把数据库中的对应数据state改为isCompleted
        this.db.save();
        this.mainWindow.webContents.send('completed',argsForWin)//通知窗口完成
    }

    interruptedDownloadItemOver(argsForWin){
        itembeginning.state = 'isCompleted';
          this.itemsCollection.update(itembeginning); //把数据库中的对应数据state改为isCompleted
          this.db.save();
          webContents.send('completed',argsForWin)//通知窗口完成
    }

    firstDownloadItemCanceled(){

    }
    interruptedDownloadItemCanceled(){

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