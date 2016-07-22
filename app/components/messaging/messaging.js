angular.module("ulakbus.messaging")

    .directive('messaging', function (Generator, MessagingService, $log, $rootScope, MessagingPopup, Utils) {

        function getKey (channel) {
            if (!channel) return;
            if (!angular.isObject(channel)) return channel;
            var channelKey = channel.channel_key;
            if (channel.hasOwnProperty('key')){
                channelKey = channel.key; // direct channel
            }
            return channelKey;
        }

        function searchWrapper(scope, promiseWrapper){
            scope.loading = true;
            scope.searchResult = [];
            promiseWrapper()
                .then(function(result){
                    scope.searchResult = result;
                })
                .finally(function(){
                    scope.loading = false;
                })
        }

        return {
            templateUrl: 'components/messaging/templates/index.html',
            restrict: 'E',
            scope: {},
            link: function(iScope, iElem, iAttrs){
                iScope.chatAppIsHidden = true;

                // shared object to populate models through scopes
                iScope.shared = {};

                var popupRootElement = $(iElem).find('.popup-placeholder');

                function editChannelPopup (channel){
                    return MessagingPopup.show({
                        templateUrl: "components/messaging/templates/create_channel.html",
                        rootElement: popupRootElement,
                        link: function(scope){
                            scope.channel = channel||{};
                            scope.title = "Edit channel";
                            scope.actionTitle = "Edit";
                            if (!channel){
                                scope.title = "Create new channel";
                                scope.actionTitle = "Create";
                            }
                        }
                    })
                }

                function updateLastMessage(message){
                    if (!message && iScope.selectedChannel && iScope.selectedChannel.messages.length > 0){
                        var last = iScope.selectedChannel.messages.length - 1;
                        return iScope.lastMessage = iScope.selectedChannel.messages[last];
                    }
                    return iScope.lastMessage = message;
                }

                function appendMessage(channel, message){
                    if (channel && getKey(channel) == getKey(iScope.selectedChannel)){
                        if (channel.messages){
                            channel.messages.push(message);
                        }
                    }
                    updateLastMessage(message);
                }

                function updateAndSelect(channelKey){
                    channelKey = getKey(channelKey);
                    return iScope.updateChannelsList().then(function(){
                        return iScope.selectChannel(channelKey);
                    })
                }

                function deleteMessageLocally(messageKey){
                    if (iScope.selectedChannel){
                        Utils.deleteWhere(iScope.selectedChannel.messages, {'key': messageKey});
                    }
                }

                iScope.deleteConfirmation = function(title){
                    return MessagingPopup.show({
                        templateUrl: "components/messaging/templates/delete_confirmation.html",
                        link: function(scope){
                            scope.title = title || "Are you sure you want to delete?";
                        },
                        rootElement: popupRootElement
                    })
                };

                iScope.updateChannelsList = function(){
                    return MessagingService.list_channels().then(function (groupedChannels) {
                        iScope.publicChannels = groupedChannels[MessagingService.CHANNEL_TYPE.PUBLIC];
                        iScope.notificationsChannel = groupedChannels[MessagingService.CHANNEL_TYPE.NOTIFICATION][0];
                        iScope.directChannels = groupedChannels[MessagingService.CHANNEL_TYPE.DIRECT];
                    });
                }

                this.createDirectChannel = function(user){
                    // user format is ['username', 'key', 'avatarUrl']
                    var key = user[1];
                    MessagingService.create_direct_channel(key)
                        .then(function(result){
                            updateAndSelect(getKey(result));
                        })
                };

                iScope.createDirectChannel = this.createDirectChannel;

                iScope.hideApp = function(){
                    iScope.chatAppIsHidden = true;
                };

                iScope.showApp = function(){
                    iScope.chatAppIsHidden = false;
                    iScope.updateChannelsList();
                }

                iScope.searchUser = function(){
                    MessagingPopup.show({
                        templateUrl: "components/messaging/templates/search_user.html",
                        rootElement: popupRootElement,
                        link: function(scope){
                            scope.onChange = function(query){
                                searchWrapper(scope, function(){
                                    return MessagingService.search_user(query);
                                })
                            };
                            scope.onChange("");
                        }
                    }).then(function(user){
                        return iScope.createDirectChannel(user);
                    });
                };

                iScope.createChannel = function(){
                    return editChannelPopup().then(function(channel){
                        return MessagingService.create_channel(channel.name, channel.description||"")
                            .then(function(newChannel){
                                updateAndSelect(newChannel)
                            });
                    })
                };

                iScope.applyChannelAction = function(channel, action){
                    var actionView = action[1];

                    switch (actionView) {

                        case '_zops_pin_channel':
                            MessagingService.pin_channel(getKey(channel));
                            break;

                        case '_zops_delete_channel':
                            iScope.deleteConfirmation('Are you sure you want to delete channel?')
                                .then(function(){
                                    MessagingService.delete_channel(getKey(channel));
                                });
                            break;

                        case '_zops_edit_channel':
                            editChannelPopup(channel).then(function(channelData){
                                return MessagingService.edit_channel(getKey(channelData), channelData.name, channelData.description||"");
                            });
                            break;

                        case '_zops_add_members':
                            MessagingPopup.show({
                                templateUrl: "components/messaging/templates/add_user_unit.html",
                                rootElement: popupRootElement,
                                link: function(scope){
                                    scope.title = "Add User to channel";
                                    scope.placeholder = "Search User to Add";
                                    scope.onChange = function(query){
                                        searchWrapper(scope, function(){
                                            return MessagingService.search_user(query);
                                        })
                                    };
                                    scope.onChange("");
                                }
                            }).then(function(userKey){
                                return MessagingService.add_members(getKey(channel), [userKey]);
                            });
                            break;

                        case "_zops_add_unit_to_channel":
                            MessagingPopup.show({
                                templateUrl: "components/messaging/templates/add_user_unit.html",
                                rootElement: popupRootElement,
                                link: function(scope){
                                    scope.title = "Add Unit";
                                    scope.placeholder = "Search Unit to Add";
                                    scope.onChange = function(query){
                                        searchWrapper(scope, function(){
                                            return MessagingService.search_unit(query);
                                        })
                                    };
                                    scope.onChange("");
                                }
                            }).then(function(unitKey){
                                var channelKey = getKey(iScope.selectedChannel);
                                return MessagingService.add_members(channelKey, unitKey);
                            });
                            break;
                    }
                };

                function selectChannel(channelKey, silent){
                    if (!silent) iScope.loadingChannel = true;
                    return MessagingService.show_channel(channelKey).then(function(result){
                        return result;
                    }).finally(function(){
                        iScope.loadingChannel = false;
                    })
                }

                iScope.selectChannel = function(channel, silent){
                    var channelKey = getKey(channel);
                    selectChannel(channelKey, silent).then(function(result){
                        iScope.selectedChannel = result;
                        iScope.selectedChannel.messages = result.last_messages;
                        updateLastMessage(channel.messages);
                    });
                };

                iScope.isChannelSelected = function(channel){
                    return getKey(channel) == getKey(iScope.selectedChannel);
                }

                iScope.sendMessage = function(content){
                    if (!content) return;
                    var channelKey = getKey(iScope.selectedChannel);
                    // select message type: 2 - direct message, 4 - channel message;
                    var msgType = iScope.selectedChannel.type == MessagingService.CHANNEL_TYPE.DIRECT ? 2 : 4;
                    MessagingService.create_message(channelKey, msgType, content).then(function(){
                        iScope.shared.message = "";
                    });
                };

                iScope.applyMessageAction = function(message, action){
                    var actionView = action[1];
                    switch (actionView) {
                        case "_zops_favorite_message":
                            MessagingService.add_to_favorites(message.key)
                                .then(function(){
                                    // force actions to reload
                                    message.actions = null;
                                });
                            break;
                        case "_zops_flag_message":
                            MessagingService.flag_message(message.key, true)
                                .then(function(){
                                    // force actions to reload
                                    message.actions = null;
                                });
                            break;
                        case "_zops_unflag_message":
                            MessagingService.flag_message(message.key, false)
                                .then(function(){
                                    // force actions to reload
                                    message.actions = null;
                                });
                            break;
                        case "_zops_delete_message":
                            iScope.deleteConfirmation("Are you sure you want to delete message?")
                                .then(function(){
                                    return MessagingService.delete_message(message.key).then(function(){
                                        deleteMessageLocally(message.key);
                                    })
                                });
                            break;
                        case "_zops_edit_message":
                            break;
                    }
                };

                iScope.getMessageActions = function(message){
                    if (message.actions) return;
                    MessagingService.get_message_actions(message.key).then(function(result){
                        message.actions = result.actions;
                    })
                };

                // listen to new messages and add them to selected channel if any
                $rootScope.$on("message", function(e, message){
                    appendMessage(iScope.selectedChannel, MessagingService.prepareMessage(message));
                });
                // notifications in messaging window are processed as ordinary messages
                $rootScope.$on("notifications", function(e, notification){
                    appendMessage(iScope.selectedChannel, MessagingService.prepareMessage(notification));
                });
            }
        };
    })

    .filter('fromNow', function(Moment){
        return function(datetime){
            return Moment(datetime).fromNow();
        }
    })

    .directive("scrollDownWhenUpdate", function($timeout){
        return {
            scope: {
                changesWatcher: "&scrollDownWhenUpdate"
            },
            link: function(iScope, iElem, iAttrs){
                var elem = $(iElem);
                iScope.$watch(iScope.changesWatcher, function(value){
                    if (value){
                        // update on next digest
                        $timeout(function(){
                            elem.scrollTop(elem[0].scrollHeight);
                        }, 0);
                    }
                });
            }
        }
    })
