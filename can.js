Can = {
    debug: true,
    userRoleKey: 'role',
    customPermissionTypes: [],

    permissionTypes: [
        "create",
        "view",
        "edit",
        "delete"
    ],

    roles: {},
    
    collections: {},

    addPermissionType: function(permissionType) {
        this._addPermissionIn(permissionType);
        this._addPermission(permissionType);
    },

    config: function(options) {
        var can = this;
        _.each(options, function (value, key) {
            can[key] = value;
        });

        _.each(this.customPermissionTypes, function(permission) {
            can._addPermissionIn(permission);
            can._addPermission(permission);
        });
    },
    
    _ucFirst: function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    },

    registerCollection: function(name, collection, options) {
        this.collections[name] = {
            collection: collection,
            authorizationLevel: options.authorizationLevel,
            usersKeyName: options.usersKeyName || 'users',
            ownerKeyName: options.usersKeyName || 'userId',
            rolePermissionsKeyName: options.rolePermissionsKeyName || 'permissions',
            roles: {},
            permissions: false
        };
    },
    
    _addPermission: function(permission) {
        this[permission] = function(checkType, checkId, userId) {
            return this.do(permission, checkType, checkId, userId);
        };

        this["allow" + this._ucFirst(permission)] = function(toType, toId, userId) {
            return this._setPermission(permission, toType, toId, true, userId);
        };

        this["deny" + this._ucFirst(permission)] = function(toType, toId, userId) {
            return this._setPermission(permission, toType, toId, false, userId);
        };

        this["set" + this._ucFirst(permission)] = function(toType, toId, permission, userId) {
            return this._setPermission(permission, toType, toId, permission, userId);
        };

        if (Meteor.isClient) {

            var helperName = "Can" + this._ucFirst(permission);

        }
    },

    _addPermissionIn: function(permission) {
        this[permission + "In"] = function(checkType, checkId, checkInType, checkInId, userId) {
            return this.doIn(permission, checkType, checkId, checkInType, checkInId, userId);
        };

        this["allow" + this._ucFirst(permission) + "In"] = function(subject, toType, toId, userId) {
            return this._setPermission(permission, subject, toType, toId, true, userId);
        };

        this["deny" + this._ucFirst(permission) + "In"] = function(subject, toType, toId, userId) {
            return this._setPermission(permission, subject, toType, toId, false, userId);
        };

        this["set" + this._ucFirst(permission) + "In"] = function(subject, toType, toId, permission, userId) {
            return this._setPermission(permission, subject, toType, toId, permission, userId);
        };

        if (Meteor.isClient) {

            var helperName = "Can" + permission.charAt(0).toUpperCase() + permission.slice(1) + "In";

        }
    },
    
    createPermissionsIn: function(permissions, forType) {
        this.collections[forType].permissions = permissions;
    },

    createRoleIn: function(role, permissions, forType) {
        this.collections[forType].roles[role] = permissions;
    },

    createRole: function(role, permissions, forType) {
        this.roles[role] = permissions;
    },

    _getDocument: function (inType, inId) {
        if (!this.collections[inType]) {
            throw new Meteor.Error("missing collection", "You haven't registered the collection for " + inType + ". Please register it using Can.registerCollection(" + inType + ", " + inType + "Collection)");
        }

        var doc = this.collections[inType].collection.findOne({_id: inId});

        if (!doc) {
            throw new Meteor.Error("document not found", "Could not find " + inType + " with _id: " + inId);
        } else {
            return doc;
        }
    },

    _getRolePermissions: function (inType, role) {
        return this.collections[inType].roles[role];
    },

    _getDocumentRolePermissions: function (inType, doc, role) {
        if (typeof doc[this.collections[inType].rolePermissionsKeyName] !== 'undefined') {
            return doc[this.collections[inType].rolePermissionsKeyName][role];
        } else {
            return false;
        }
    },

    _verifyPermissionIn: function (checkType, checkIdOrObject, checkInType, checkInIdOrObject, permissionSubjectValue, permissionAction, userId) {
        var checkId = checkIdOrObject;
        var checkInId = checkInIdOrObject;

        if (_.isObject(checkId)) {
            checkId = checkIdOrObject._id;
        }

        if (_.isObject(checkInId)) {
            checkInId = checkInIdOrObject._id;
        }

        if (_.isObject(permissionSubjectValue)) {
            var permission = permissionSubjectValue[permissionAction];
            if (typeof permission !== 'undefined') {
                if (this.debug) console.log("coniel_can debug: Permission is " + permission + " for " + permissionAction + " " + checkType + " in " + checkInType + ": " + checkInId);
                if (typeof permission !== 'function') {
                    if (permission === 'own') {
                        return this._checkIfOwn(checkType, checkId, userId);
                    } else {
                        return permission;
                    }
                } else {
                    if (this.debug) console.log("coniel_can debug: Permission is " + permission(checkIdOrObject, checkInType, checkInIdOrObject) + " (resolved) for " + permissionAction + " " + checkType + " in " + checkInType + ": " + checkInId);
                    return permission(checkIdOrObject, checkInType, checkInIdOrObject);
                }
            } else {
                if (this.debug) console.log("coniel_can debug:", 'Could not find "' + permissionAction + '" permission for ' + checkType + ' for user with _id: "' + userId + '" in this ' + checkInType + ". Assuming permission is denied.");
                return false;
            }
        } else if (typeof permissionSubjectValue === 'boolean' || typeof permissionSubjectValue === 'string') {

            if (this.debug) console.log("coniel_can debug: Permission is " + permissionSubjectValue + " for " + permissionAction + " " + checkType + " in " + checkInType + ": " + checkInId);
            if (permissionSubjectValue === 'own') {
                return this._checkIfOwn(checkType, checkId, userId);
            } else {
                return permissionSubjectValue;
            }
        } else if (typeof permissionSubjectValue === 'function') {
            if (this.debug) console.log("coniel_can debug: Permission is " + permissionSubjectValue(checkIdOrObject, checkInType, checkInIdOrObject) + " (resolved) for " + permissionAction + " " + checkType + " in " + checkInType + ": " + checkInId);
            return permissionSubjectValue(checkIdOrObject, checkInType, checkInIdOrObject);
        } else {
            return false;
        }
    },

    assignRoleIn: function(role, inType, inId, userId) {

        if (typeof userId === 'undefined') {
            userId = Meteor.userId();
        }

        // Check if the role has been defined in the rolesIn array
        var rolePermissions = this.collections[inType].roles[role];

        if (!rolePermissions) {
            // Check if the role has been defined in the roles array
            if (this.debug) console.log("coniel_can debug:", "Could not find role " + role + " in " + inType + " roles (you can create it using \"Can.createRoleIn(" + role + ", {document}, " + inType + ")\". Checking global roles.");
            rolePermissions = this.roles[role];
            if (this.debug && rolePermissions) console.log("coniel_can debug:", "Found it.");
        }

        if (!rolePermissions) {
            console.error("coniel_can error:", "Role " + role + " has not been defined. Make sure you create it using Can.createRole(role, permissions) or Can.createRoleIn(role, permissions, forType).");
            return false;
        }

        // Get the document to which we want to add the role
        var document = this._getDocument(inType, inId);

        // Check if the user's permissions object has an array for this inType
        if (!document[this.collections[inType].usersKeyName]) {
            document[this.collections[inType].usersKeyName] = [];
        }

        var newPermissions = {
            userId: userId,
            role: role
        };

        // Check the inType array already has a role for the current inId
        var existingPermissions = _.findWhere(document[this.collections[inType].usersKeyName], {userId: userId});
        if (existingPermissions) {
            document[this.collections[inType].usersKeyName][document[this.collections[inType].usersKeyName].indexOf(existingPermissions)] = newPermissions;
        } else {
            document[this.collections[inType].usersKeyName].push(newPermissions);
        }

        var updateDoc = {};
        updateDoc[this.collections[inType].usersKeyName] = document[this.collections[inType].usersKeyName];
        this.collections[inType].collection.update({_id: document._id}, { $set: updateDoc }, function(error, result) {
            if (error) console.log(error);
        });
    },

    revokeRoleIn: function (inType, inId, userId) {

        if (typeof userId === 'undefined') {
            userId = Meteor.userId();
        }

        // Get the document from which we want to revoke the role
        var document = this._getDocument(inType, inId);

        if (document[this.collections[inType].usersKeyName]) {
            var permission = _.findWhere(document[this.collections[inType].usersKeyName], {userId: userId});

            if (permission) {
                document[this.collections[inType].usersKeyName].splice(document[this.collections[inType].usersKeyName].indexOf(permission), 1);

                var updateDoc = {};
                updateDoc[this.collections[inType].usersKeyName] = document[this.collections[inType].usersKeyName];

                this.collections[inType].collection.update({_id: document._id}, { $set: updateDoc });
            } else {
                if (this.debug) console.log("coniel_can debug:", "User " + userId + " does not have permissions defined for " + inType + " with _id " + inId);
            }
        } else {
            if (this.debug) console.log("coniel_can debug:", "No users array defined for " + inType + " with _id: " + inId);
        }
    },

    do: function(checkPermission, checkType, checkIdOrObject, userId) {

        if (typeof userId === 'undefined') {
            userId = Meteor.userId();
        }

        var document = checkIdOrObject;
        var checkId = checkIdOrObject;

        if (typeof checkIdOrObject === 'string') {
            document = this._getDocument(checkType, checkIdOrObject);
        } else {
            checkId = document._id;
        }

        if (document) {
            var permission = this.collections[checkType][checkPermission];

            if (!permission) { // No general permission found
                if (Meteor.user() && Meteor.user[this.userRoleKey]) {
                    permission = this.collections[checkType]
                }
            }
        }

        if (document && document[this.collections[checkType].usersKeyName]) {
            var permissionsForUser = _.findWhere(document[this.collections[checkType].usersKeyName], {id: checkId});
            if (permissionsForUser) {
                var permission = permissionsForUser[checkPermission];
                if (typeof permission !== 'undefined') {
                    if (this.debug) console.log("coniel_can debug: Permission to " + checkPermission + " in " + checkType + " with _id " + checkId + " for user with id: " + userId + " is " + permission);
                    return permission;
                } else {
                    if (this.debug) console.log("coniel_can debug:", 'Could not find "' + checkPermission + '" permission for user with _id: "' + userId + '" in this ' + checkType + ". Assuming permission is denied.");
                    return false;
                }
            } else {
                if (this.debug) console.log("coniel_can debug:", "No permissions for " + checkType + " with id " + checkId + " defined for user with id: " + userId + ". Assuming permission is denied.");
            }
        } else {
            if (this.debug) console.log("coniel_can debug:", "No " + checkType + " permissions defined for user with id: " + userId + ". Assuming permission is denied.");
            return false;
        }
    },

    doIn: function(checkPermission, checkType, checkId, checkInType, checkInId, userId) {
        if (typeof userId === 'undefined') {
            userId = Meteor.userId();
        }

        if (this.collections[checkInType].authorizationLevel === 'document') {
            return this._doInRole(checkPermission, checkType, checkId, checkInType, checkInId, userId);
        } else {
            return this._doInPermission(checkPermission, checkType, checkId, checkInType, checkInId, userId);
        }

    },

    _doInRole: function (checkPermission, checkType, checkIdOrObject, checkInType, checkInIdOrObject, userId) {

        var document = checkInIdOrObject;
        var checkId = checkIdOrObject;
        var checkInId = checkInIdOrObject;
        if (typeof checkInIdOrObject === 'string') {
            document = this._getDocument(checkInType, checkInIdOrObject);
        } else {
            checkInId = document._id;
        }
        
        if (_.isObject(checkId)) {
            checkId = checkIdOrObject._id;
        }

        if (document && document[this.collections[checkInType].usersKeyName]) {

            var permissionsForUser = _.findWhere(document[this.collections[checkInType].usersKeyName], {userId: userId});

            if (permissionsForUser) {
                var checkTypePermission = permissionsForUser[checkType];
                if (typeof checkTypePermission !== 'undefined') {
                    return this._verifyPermissionIn(checkType, checkIdOrObject, checkInType, checkInIdOrObject, checkTypePermission, checkPermission, userId);
                } else {
                    if (this.debug) console.log("coniel_can debug:", 'No user level permissions in ' + checkType + ' for user with _id: "' + userId + '" in this ' + checkInType + ". Checking custom role permissions.");
                    var userRole = permissionsForUser.role;

                    if (userRole) {
                        var rolePermissions = this._getDocumentRolePermissions(checkInType, document, permissionsForUser.role);

                        if (rolePermissions) {
                            var checkTypePermission = rolePermissions[checkType];
                            return this._verifyPermissionIn(checkType, checkIdOrObject, checkInType, checkInIdOrObject, checkTypePermission, checkPermission, userId);
                        } else {
                            if (this.debug) console.log("coniel_can debug:", 'No custom role level permissions in this ' + checkInType + ". Checking general role permissions.");

                            var generalRolePermissions = this._getRolePermissions(checkInType, permissionsForUser.role);

                            if (generalRolePermissions) {

                                var checkTypePermission = generalRolePermissions[checkType];

                                if (checkTypePermission) {
                                    return this._verifyPermissionIn(checkType, checkIdOrObject, checkInType, checkInIdOrObject, checkTypePermission, checkPermission, userId);
                                } else {
                                    if (this.debug) console.log("coniel_can debug:", "No " + checkPermission + " permissions defined for " + checkType + " in " + checkInType + " for role " + userRole + ". Assuming permission is denied.");
                                    return false;
                                }
                            } else {
                                if (this.debug) console.log("coniel_can debug:", 'No general role level permissions in this ' + checkInType + ". Assuming permission is denied.");
                                return false;
                            }
                        }
                    } else {
                        if (this.debug) console.log("coniel_can debug:", 'No role found in ' + checkType + ' for user with _id: "' + userId + '" in this ' + checkInType + ". Assuming permission is denied.");
                    }
                }
            } else {
                if (this.debug) console.log("coniel_can debug:", "No permissions for " + checkInType + " with id " + checkInId + " defined for user with id: " + userId + ". Assuming permission is denied.");
            }
        } else {
            if (this.debug) console.log("coniel_can debug:", "No " + checkInType + " permissions defined for user with id: " + userId + ". Assuming permission is denied.");
            return false;
        }
    },

    _doInPermission: function (checkPermission, checkType, checkIdOrObject, checkInType, checkInIdOrObject, userId) {
        var permissions = this.collections[checkInType].permissions;

        if (permissions) {
            var checkTypePermission = permissions[checkType];
            return this._verifyPermissionIn(checkType, checkIdOrObject, checkInType, checkInIdOrObject, checkTypePermission, checkPermission, userId);
        } else {
            if (this.debug) console.log("coniel_can debug:", 'No permissions defined for ' + checkInType + ". Assuming permission is denied.");
            return false;
        }
    },

    _checkIfOwn: function(checkType, checkId, userId) {
        var document = this.collections[checkType].collection.findOne({_id: checkId});

        if (document) {

            if (typeof this.collections[checkType].ownerKeyName === 'undefined') {
                throw new Meteor.Error("ownerKeyName_undefined", "No ownerKeyName is defined for the " + checkType + " collection. Please define it when registering the collection.");
            }

            if (typeof document[this.collections[checkType].ownerKeyName] === 'undefined') {
                if (this.debug) console.log("no_owner_defined", "No owner id (" + this.collections[checkType].ownerKeyName + ") found in " + checkType + " with id: " + checkId + ". Assuming permission is denied.");
                return false;
            }

            if (document[this.collections[checkType].ownerKeyName] === userId) {
                if (this.debug) console.log("coniel_can debug:", "User with id: " + userId + " owns the " + checkType + " with id: " + checkId + ". Permission granted.");
                return true;
            } else {
                if (this.debug) console.log("coniel_can debug:", "User with id: " + userId + " does not own the " + checkType + " with id: " + checkId + ". Permission denied.");
                return false;
            }
        } else {
            if (this.debug) console.log("coniel_can debug:", "No " + checkType + " with id: " + checkId + " was found. Assuming permission is denied.");
        }
    },

    _setPermission: function(action, inType, inId, permission, userId) {
        
        var document = this._getDocument(inType, inId);

        if (!document[this.collections[inType].usersKeyName]) {
            document[this.collections[inType].usersKeyName] = [];
        }

        var permissionsForUser = _.findWhere(document[this.collections[inType].usersKeyName], {userId: userId});
        var newPermissionsObject;

        if (!permissionsForUser) {
            newPermissionsObject = {
                id: userId
            };

            newPermissionsObject[action] = permission;

            document[this.collections[inType].usersKeyName].push(newPermissionsObject);
        } else {
            newPermissionsObject = _.clone(permissionsForUser);
            newPermissionsObject[action] = permission;

            document[this.collections[inType].usersKeyName][document[this.collections[inType].usersKeyName].indexOf(permissionsForUser)] = newPermissionsObject;
        }

        this.collections[inType].collection.update({_id: document._id}, { $set: document });
    },
    
    setPermissions: function(inType, inId, permissions, userId) {

        if (typeof userId === 'undefined') {
            userId = Meteor.userId();
        }

        var document = this._getDocument(inType, inId);

        if (!document[this.collections[inType].usersKeyName]) {
            document[this.collections[inType].usersKeyName] = [];
        }

        var permissionsForUser = _.findWhere(document[this.collections[inType].usersKeyName], {userId: userId});
        var newPermissionsObject;

        if (permissionsForUser) {
            newPermissionsObject = _.clone(permissionsForUser);
            _.extend(newPermissionsObject, permissions);

            document[this.collections[inType].usersKeyName][document[this.collections[inType].usersKeyName].indexOf(permissionsForUser)] = newPermissionsObject;
        } else {
            newPermissionsObject = permissions;
            newPermissionsObject.id = userId;
            document[this.collections[inType].usersKeyName].push(newPermissionsObject);
        }

        this.collections[inType].update({_id: document._id}, { $set: document });
    },

    setPermissionsIn: function(subject, inType, inId, permissions, userId) {

        var document = this._getDocument(inType, inId);

        if (!document[this.collections[inType].usersKeyName]) {
            document[this.collections[inType].usersKeyName] = [];
        }

        var permissionsForUser = _.findWhere(document[this.collections[inType].usersKeyName], {userId: userId});

        if (permissionsForUser) {
            document[this.collections[inType].usersKeyName][document[this.collections[inType].usersKeyName].indexOf(permissionsForUser)][subject] = permissions;
        } else {
            permissionsForUser = {
                userId: userId
            };

            permissionsForUser[subject] = permissions;

            document[this.collections[inType].usersKeyName].push(permissionsForUser);
        }

        this.collections[inType].collection.update({_id: document._id}, { $set: document }, function(error, result) {
            if (error) console.log(error);
        });
    },

    _setPermissionIn: function(action, subject, inType, inId, permission, userId) {

        var document = this._getDocument(inType, inId);

        if (document[this.collections[inType].usersKeyName]) {
            document[this.collections[inType].usersKeyName] = [];
        }

        var permissionsForUser = _.findWhere(document[this.collections[inType].usersKeyName], {userId: userId});

        if (permissionsForUser) {
            var forSubject = permissionsForUser[subject];

            if (!forSubject) {
                document[this.collections[inType].usersKeyName][document[this.collections[inType].usersKeyName].indexOf(permissionsForUser)][subject] = {};
            }

            document[this.collections[inType].usersKeyName][document[this.collections[inType].usersKeyName].indexOf(permissionsForUser)][subject][action] = permission;
        } else {
            permissionsForUser = {
                userId: userId
            };

            permissionsForUser[subject] = {};
            permissionsForUser[subject][action] = permission;

            document[this.collections[inType].usersKeyName].push(permissionsForUser);
        }

        this.collections[inType].collection.update({_id: document._id}, { $set: document }, function(error, result) {
            if (error) console.log(error);
        });
    }
};

_.each(Can.permissionTypes, function(permission) {
    Can._addPermissionIn(permission);
    Can._addPermission(permission);
});

if (Meteor.isClient) {

    if (!Array.prototype.indexOf)
    {
        Array.prototype.indexOf = function(elt /*, from*/)
        {
            var len = this.length >>> 0;

            var from = Number(arguments[1]) || 0;
            from = (from < 0)
                ? Math.ceil(from)
                : Math.floor(from);
            if (from < 0)
                from += len;

            for (; from < len; from++)
            {
                if (from in this &&
                    this[from] === elt)
                    return from;
            }
            return -1;
        };
    }
}