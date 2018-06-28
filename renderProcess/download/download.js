const {ipcRenderer} = nodeRequire('electron');
const {dialog} = nodeRequire('electron').remote


class DownloadBlock {
    constructor(){
    }
    initBlock(){
        this.sendDownloadMS();
        this.listenDownloading();
        // this.reloadActiveDownloadItems();
        this.initAlldownloaditems();
        this.receivedBytesevent();
        this.isPausedevent();
        this.completedevent();
        this.cancelledevent();
    }
    checkIsDownloading (url){
        let downloading = $('.fileItem').find('.data')
        for(let i = 0; i<downloading.length; i++){
            if(JSON.parse(downloading[i].getAttribute('data-item')).url === url){
                let opts = {type:'info',message:"item is in DownloadingList"}
                dialog.showMessageBox(opts)
                return false
            }
            return true
        }
    }
    sendDownloadMS(){
        let downloadBtn = document.getElementById('downloadButton')
        let downloadUrlinput = document.getElementById('downloadUrl')
        downloadBtn.addEventListener('click',(event)=>{
            let url = $.trim(downloadUrlinput.value);
            if(url){
                ipcRenderer.send('startdownload',url)
            }else{
                return
            }
        })
    }

    getNewfileSatus(downloadingInfos){
        let fileValue = {
            'name': downloadingInfos.filename,
            'url': downloadingInfos.url,
            'status': 1,
            'downloaded':downloadingInfos.hasDownloadedBytes,
            'total': downloadingInfos.totalBytes,
            'speed': 0,
            'id':downloadingInfos.startTime*1000000
            };
        return fileValue
    }

    listenDownloading(){
        ipcRenderer.on("isDownloading",(event, downloadItemInfos,isReload)=>{
            let that = this
            let {totalBytes,startTime,newName,url} = downloadItemInfos
            let fileValue = {
                'name': newName,
                'url': url,
                'status': 1,
                'downloaded': 0,
                'total': totalBytes,
                'speed': 0,
                'id':startTime*1000000
                };
            if(!isReload){
                addFile(fileValue)
                // updateFile(fileValue)
            }
            that.addClassEvent('continueDownload',fileValue);   
            that.addClassEvent('pauseDownload',fileValue);  
            that.addClassEvent('cancelDownload',fileValue);  
            that.addClassEvent('openDir',fileValue);
            that.addClassEvent('retryDownload',fileValue); 
            that.addClassEvent('remove',fileValue)
        })
        
    }


    addClassEvent(type,fileValue,reload){
        let id = fileValue.id;
        switch(type){
            case "openDir":
                
                $("#"+id).on('click','.openDir',function(e){
                    let fileName = fileValue.name
                    let value = $('.openDir').parents('.fileItem').find('.data').data('item').name;
                    ipcRenderer.send('openDir',id,fileName);
                })
                break;
            case "cancelDownload":
                if(reload === 'initAlldownloaditems'){
                    $("#"+id).one('click','.cancel.ml10',function(e){
                        let value = $('.cancel').parents('.fileItem').find('.data').data('item');
                        updateFile(id, Object.assign({}, value, {
                                status: STATUS.progressing,
                        }));
                        if(reload === 'initAlldownloaditems'){
                            ipcRenderer.send('cancelinterrupted',id)
                            updateFile(id, Object.assign({}, value, {
                                status: STATUS.cancaled
                            }));
                        }

                    })
                    return
                }
                $("#"+id).on('click','.cancel.ml10',function(e){
                    let value = $('.cancel').parents('.fileItem').find('.data').data('item');
                    updateFile(id, Object.assign({}, value, {
                            status: STATUS.cancaled
                    }));
                    ipcRenderer.send('cancelDownload',id);
                    
                })
                break;
            case "continueDownload":
                if(reload === 'initAlldownloaditems'){
                    $("#"+id).one('click','.continue',function(e){
                        console.log(1)
                        let value = $('.continue').parents('.fileItem').find('.data').data('item');
                        updateFile(id, Object.assign({}, value, {
                                status: STATUS.progressing,
                        }));
                        ipcRenderer.send('reload',id);
    
                    })
                    return
                }
                $("#"+id).on('click','.continue',function(e){
                    console.log(2)
                    let value = $('.continue').parents('.fileItem').find('.data').data('item');
                    updateFile(id, Object.assign({}, value, {
                            status: STATUS.progressing,
                    }));
                    ipcRenderer.send('continueDownload',id);

                })
                break;
            case "pauseDownload":
                $("#"+id).on('click','.pause',function(e){
                    let value = $('.pause').parents('.fileItem').find('.data').data('item');
                    updateFile(id, Object.assign({}, value, {
                                status: STATUS.paused
                    }));
                    ipcRenderer.send('pauseDownload',id);
                })
                break;
            case "retryDownload":
                $("#"+id).on('click','.retry',function(e){
                    let value = $('.retry').parents('.fileItem').find('.data').data('item');
                    updateFile(id, Object.assign({}, value, {
                            status: STATUS.cancaled
                    }));
                    let url = value.url
                    ipcRenderer.send('startdownload',url)
                })
                break;
            case 'remove':
                $("#"+id).on('click','.remove',function(e){
                    $(this).parents('.fileItem').remove();
                    ipcRenderer.send('cancelDownload',id);
                    ipcRenderer.send('removedowanload',id)
                })
            
            default:
                console.log('err:'+type)
        }
    }
    
    // reloadActiveDownloadItems () {
    //     let datas = [];
    //     let that = this;
    //     ipcRenderer.on('reloadActiveDownloadItems', (event,reloadData,flag) =>{
    //         console.log(flag,"flag")
            
    //         $.each(reloadData,function(index,value){
    //             let downloaditem = value.downloaditem
    //             let fileValue = {
    //                 'name': downloaditem.filename,
    //                 'url': downloaditem.url,
    //                 'status': 1,
    //                 'downloaded': downloaditem.receivedBytes,
    //                 'total': downloaditem.totalBytes,
    //                 'speed': 0,
    //                 'id':downloaditem.startTime*1000000
    //             }
    //             let state = value.state;
    //             switch(state){
    //                 case 'isCompleted' : 
    //                     fileValue.status = STATUS.completed;
    //                     break;
    //                 case 'isCancelled' : 
    //                     fileValue.status = STATUS.cancaled;
    //                     break;
    //                 case 'interrupted' : fileValue.status = STATUS.paused;
    //                     break;
    //                 case 'isProgressing' : fileValue.status = STATUS.paused;
    //                     break;
    //                 default:
    //                     console.log('err')

    //             }
    //             datas.push(fileValue)
    //         })
    //         render(datas)
    //         $.each(datas,function(index,fileValue){
    //             that.addClassEvent('continueDownload',fileValue);   
    //             that.addClassEvent('pauseDownload',fileValue);  
    //             that.addClassEvent('cancelDownload',fileValue);  
    //             that.addClassEvent('openDir',fileValue);
    //             that.addClassEvent('retryDownload',fileValue); 
    //             that.addClassEvent('remove',fileValue)
    //         })
            
    //     })
    // }

    initAlldownloaditems () {
        let datas = [];
        let that = this;
        ipcRenderer.once('initAlldownloaditems', (event,reloadData,flag) =>{
            let reload 
            if(flag){
                reload = 'initAlldownloaditems';
            }
            $.each(reloadData,function(index,value){
                let downloaditem = value.downloaditem
                let fileValue = {
                    'name': downloaditem.filename,
                    'url': downloaditem.url,
                    'status': null,
                    'downloaded': downloaditem.receivedBytes,
                    'total': downloaditem.totalBytes,
                    'speed': 0,
                    'id':downloaditem.startTime*1000000
                }
                let state = value.state;
                switch(state){
                    case 'isCompleted' : 
                        fileValue.status = STATUS.completed;
                        break;
                    case 'isCancelled' : 
                        fileValue.status = STATUS.cancaled;
                        break;
                    case 'interrupted' : fileValue.status = STATUS.paused;
                        break;
                    case 'isProgressing' : fileValue.status = STATUS.paused;
                        break;
                    default:
                        console.log('err')

                }
                addFile(fileValue)
                that.addClassEvent('continueDownload',fileValue,reload);   
                that.addClassEvent('pauseDownload',fileValue,reload);  
                that.addClassEvent('cancelDownload',fileValue,reload);  
                that.addClassEvent('openDir',fileValue,reload);
                that.addClassEvent('retryDownload',fileValue,reload); 
                that.addClassEvent('remove',fileValue,reload)
            })
           
            // render(datas)
        })
    }
    getfilevalue(id){
        return $("#"+id).find('.data').data('item')
       
    }
    receivedBytesevent(){
         ipcRenderer.on('receivedBytes',(event,arg,speed,hasDownloadedBytes,startTime,fileUrl,filename,filesize)=>{
                console.log(hasDownloadedBytes,"hasDownloadedByteshasDownloadedBytes")
                let id = startTime*1000000
                let fileValue = this.getfilevalue(id)
                if(fileValue){
                    fileValue.downloaded = Number(arg);
                }else{
                    return
                }
                updateFile(startTime*1000000, Object.assign({}, fileValue, {
                        downloaded:arg,
                        speed:speed,
                        name:filename,
                        fileUrl:fileUrl,
                        total:filesize,
                        status: fileValue.downloaded === fileValue.total ? STATUS.completed : STATUS.progressing
                      }));
            })
    }
    isPausedevent(){
        ipcRenderer.on('isPaused',(event,downloadingInfos)=>{
            let newFile = this.getNewfileSatus(downloadingInfos)
            newFile.status = STATUS.paused
            let startTime = downloadingInfos.startTime*1000000;
            let fileValue = this.getfilevalue(startTime)
            updateFile(startTime, Object.assign({}, fileValue,newFile ));
        })
    }
    completedevent(){
        ipcRenderer.on('completed',(event,downloadingInfos)=>{
            let newFile = this.getNewfileSatus(downloadingInfos)
            newFile.status = STATUS.completed
            let startTime = downloadingInfos.startTime*1000000;
            let fileValue = this.getfilevalue(startTime)
            updateFile(startTime, Object.assign({}, fileValue, newFile));                
        })   
    }
    cancelledevent(){
        ipcRenderer.on('cancelled',(event,downloadingInfos)=>{
            let newFile = this.getNewfileSatus(downloadingInfos)
            newFile.status = STATUS.cancaled;
            let startTime = downloadingInfos.startTime*1000000;
            let fileValue = this.getfilevalue(startTime)
            updateFile(startTime, Object.assign({}, fileValue, newFile));      
        }) 
    }
   
    
}
new DownloadBlock().initBlock()