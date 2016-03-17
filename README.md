Can
===

Advanced document level and role based authorisation made easy.

Quick examples
```javascript
// Check if a user is allowed to create files
if (Can.create("file", file)) {
    FilesCollection.insert(file);
}
```

```javascript
// Check if a user is allowed to create a post inside of a group
if (Can.createIn("post", post, "group", groupId)) {
    PostsCollection.insert(post);
}
```

```javascript
// You can easily create your own permission types
Can.addPermissionType("like");
if (Can.likeIn("post", postId, "group", groupId)) {
    PostsCollection.insert(post);
}
```
# Registering collections
In order to use Can to validate actions on or related to a collection, you need to register it:
```javascript
// Can.registerCollection(<String> modelName, <MongoCollection> collection);
Can.registerCollection("user", Meteor.users);
```
# Collection level permissions
To setup the actual permissions, we dfine a permissions object for the collection. Each key in the permissions object represents a type of collection document (AKA a model). We then define the permission for each action we want to validate (if you don't define a permission for a certain action it will simply return as denied when you run a check on it).

Imagine we are building a document storage app like Dropbox. We want to allow users to create files, but only in their own Dropbox. We also want users to be able to remove and update files. To do this we use `Can.createPermissionsIn(<Object> permissions, <String> modelName)`:
```javascript
Can.createPermissionsIn({
    create: true,
    edit: 'own',
    delete: 'own'
}, "file");
```
The `'own'` permission will check if the action is being run on a document which belongs to the user (by default it will check for a `userId` value on the document but you can specify your own key when setting up the collection). So in this case the users will be allowed to edit/delete files as long as the `userId` value on the file matches their own _id.

# Creating roles
Now let's say we want to have two types of users: admins and members. Members will have the permissions that we defined above and admins will be allowed to delete anyone's files.
## Global roles
There are a couple of ways we can define the roles. Let's start with the admin role, which we will define at a global level:
```javascript
Can.createRole("admin", {
    create: true,
    edit: true,
    delete: true
});
```
This will create a global `admin` role which will be used by default in all checks. The reason to define the admin role globally is that, in general, admins will always have full rights, so we can save having to define `true` for every action on each collection.
## Collection level roles
For the `member` role, we will define the permissions on the collection level. It's best to avoid global permissions for things like the `member` role so that we don't leave any security holes by explicilty defining each permission. To add role specific permissions on the collection, we simply define the permissions under a key with the same value as the role:
```javascript
Can.createRoleIn("member", {
    create: true,
    edit: 'own',
    delete: 'own'
}, "file");
```

Now we can perform checks to authorize actions:
```javascript
// Inside the method to delete a file
if (Can.delete("file", fileId)) {
    FilesCollection.remove({_id: fileId});
}
```

To understand how the authorization procedure works and how our roles come into play let's take a look at what happens when we call `Can.delete("file", fileId)`:

- First Can will fetch the document from the appropriate collection using the provided id (you can also pass in the document directly instead of an id). If no document is found the permission is denied.
- Next can will check if there is a general permission at the collection level for the action being verified (such as we defined at first before we created the roles). If a permission is found it will return the value.
- If no general level permission is found, Can will check if the user has a role (by default it looks for a `role` key on the user document). If the user has no role, the permission is denied.
- If the user has a role, Can will check if there are role specific pemissions defined at the collection level (such as we defined for the `member` role on files collection). If the role exists and has a permission defined for the action being verified, the permission value is returned. If the role is not defined at the collection level, or there is no permission definition for the action being verified, Can will look for a global role.
- If the role exists on the global level (such as we defined for the `admin` role), Can will look for a permission for the action being verified. If a permission is defined it will return the value, otherwise the permission is denied.
- If there is no global level role the permission is denied.

# Document level permissions
Let's say we have a social app in which users can create groups. Groups have admins, moderators and members, each with their own permissions.

We could easily setup roles as we did above, but let's say we want to give users the ability to customise some of the permissions. For example, let's say one of our users is a teahcer. She creates a group in which she will post news articles for her students to comment on. Students will should only have the ability to comment on posts, not create the posts themselves.

Document level permissions will allow us to let users modify the default permissions by setting them directly on the `group` document. To get started, let's setup our collection:
```javascript
Can.registerCollection("group", GroupsCollection, { authorizationLevel: 'document' });
```
We specify that the collection will have document level permissions by passing in the `authorizationLevel: 'document'` option.

Next we define the roles in the same way we defined the `member` role earlier. We will define all of the roles on the collection level as in this case the `admin` role refers to the group admin and not a system admin, so we won't be using the global role. Let's start with the `member` role, this is a little different to when we defined the `member` role eariler:
```javascript
Can.createRoleIn("member", {
    view: true,
    post: {
        create: true,
        edit: 'own',
        delete: 'own'
    },
    comment: {
        create: true,
        edit: 'own',
        delete: 'own'
    }
}, "group");
```
 In this case `view` refers to viewing the group itself. To define the permissions members have in regards to `posting/commenting`, we simply add a `comment` document with the needed permissions.

 Next let's define the moderator role:
```javascript
Can.createRoleIn("moderator", {
    view: true,
    post: {
        create: true,
        edit: 'own',
        delete: (post, checkInType, group) => {
            return !Can.hasRoleIn("admin", checkInType, group, post.userId);
        }
    },
    comment: {
        create: true,
        edit: 'own',
        delete: (post, checkInType, group) => {
            return !Can.hasRoleIn("admin", checkInType, group, post.userId);
        },
    }
}, "group");
```
In this case moderators are allowed to view the goup, create comments and posts, edit their own comments and posts, and delete comments and posts as long as they weren't created by an admin.

Finally let's create the admin role.
```javascript
Can.createRoleIn("admin", {
    view: true,
    edit: true,
    delete: true,
    post: true,
    comment: true,
    acceptMembershipRequest: true,
    promoteMember: true
}, "group");
```
In this case view/edit/delete refer to the group itself (so admins have the ability to edit and delete the group). We can simply set `post` and `comment` to `true`, since admins will be allowed to perform all actions related to those models. We also give admins the right to accept membership requests and promote members. To be able to verify the last two, we'll need to create custom permission types (so that we can call them as methods: `Can.promoteMember(...)`):
```javascript
Can.addPermissionType("acceptMembershipRequest");
Can.addPermissionType("promoteMember");
```

Now that we've defiend our roles, we simply assign one of the roles to our users. For example, here's a basic method to create a group. We assign the user as an admin in the group in the callback function of the insert:
```javascript
// Note! For the sake of brievety this example does not validate
// the user input which you shoud ldefinitively do.
Meteor.methods({
    createGroup: (doc) => {
        if (Can.create("group", doc)) {
            return GroupsCollection.insert(doc, (error, result) => {
                if (!error) {
                    Can.assignRoleIn("admin", "group", result);
                }
            });
        }
    }
});
```
Next let's create methods to have people join groups and be promoted to moderators/admins:
```javascript
// Note! For the sake of brievety this example does not validate
// the user input which you shoud ldefinitively do.
Meteor.methods({
    acceptMembershipRequest: (userId, groupId) => {
        if (Can.acceptMembershipRequest("group", groupId)) {
            Can.assignRoleIn("member", "group", groupId, userId);
        }
    },
    promoteMember: (userId, groupId, role) => {
        if (Can.promoteMember("group", groupId)) {
            Can.assignRoleIn(role, "group", groupId, userId);
        }
    },
});
```

Before we move on to creating methods to let admins customize the group's permissions, let's take a look at how the actual authorization process goes when, for example, you call `Can.createIn("comment", commentDoc, "group", groupId)`:
- First, Can will retreive the "in" document (in this cae the group). If no document is found the permission is denied.
- If a document is found, Can will look for a user object in the document's array of users (by default it looks under for a `users` key). If no user object is found, the permission is denied.
- If an object is found, Can will look for user level custom permission (these are storred in the user object retreived in the previous step). If a user level custom permission is found, its value is returned.
- If no user level custom permission is found, Can will check the role level custom permissions (these are found on the document under permissions[role] by default) based on the user's role. If a custom role level permission is found, it's value is returned.
- If there are no custom role level permissions (or the specific permission being verified), Can will check the collection level permissions (which is what we defined when creating the roles).
- Finally if the user's role is defined on the global level, Can will check the permission from there.

Here is what a group document would look like:
```javascript
{
    _id: "h4df839fwh59f3h3",
    name: "Comment on articles group",
    users: [
        {
            userId: "j3jd9ud3952",
            role: "admin"
        },
        {
            userId: "a0s9v8eht6k",
            role: "moderator",
            permissions: {  // This is what custom user level permissions would look like
                comment: {
                    edit: true  // This moderator is allowed to edit all comments
                }
            }
        },
        {
            userId: "w038ngt597",
            role: "member"
        },
    ],
    permissions: {  // This is what custom role level permissions would look like
        member: {
            posts: {
                create: false   // Members cannot create posts
            }
        }
    }
}
```

## Custom document level permissions
Now let's create some methods so that group admins can modify role permissions.
```javascript
// Note! For the sake of brievety this example does not validate
// the user input which you shoud ldefinitively do.
Meteor.methods({
    setRolePermission: (permission, value, role, groupId) => {
        if (Can.hasRoleIn("admin", "group", groupId)) {
            Can.setPermissionForRoleIn(permission, value, role, "group", groupId);
        }
    },
    setUserPermission: (permission, value, userId, groupId) => {
        if (Can.hasRoleIn("admin", "groud, groupId)) {
            Can.setPermissionForUserIn(permission, value, userId, "group", groupId);
        }
    }
});
```
As you can see it's easy to set custom role/user level permission on the groups. Keep in mind that these methods are not validated, which can be extremely dangerous. In this case you should limit which permissions and for which roles the permissions can be modified.

And that's it! We've setup our roles and the ability for admins to set custom permissions on those roles and even individual users. Now you can check whether user's are allowed to perform actions such as creating posts: `Can.createIn("post", postDoc, "group", groupId);`

# API reference
## Configuration
### Global
**Can.debug** (<Boolean> false) - set to true to enable a verbose debugging mode

**Can.userRoleKey** (<String> "role") - the attribute representing the user's role on the user document

**Can.customPermissionTypes** (<Array> []) - pass in a list of permission types so you can call them as methods (e.g. if you pass in ["like"] you will be able to call `Can.like(...)` and `Can.likeIn(...)`). It's the equivalent of calling `Can.addPermissionType` on each of the array values.

### Collection level
Pass these in the options object when calling `Can.registerCollection("item", collection, options)`:

**authorizationLevel** (<String> null) - if authenticating on the document level, pass set this to `'document'`

**usersKeyName** (<String> "users") - the key for the array of users when using document level authentication

**ownerKeyName** (<String> "userId") - the key used for the user id of the document owner/creator

**rolePermissionsKeyName** (<String> "permissions") - the key for the object or custom role level permissions

## Registering collections
```javascript
Can.registerCollection(<String> itemName, <MongoCollection> collection, <Object> options);
```
Item name represents a single item of the collection (e.g. "comment").

## Defining permissions
Permission values:
- `<Boolean>` Setting a boolean value on a permission will simply return the value
- `<String> 'own'` Setting 'own' as the value will check whether the user owns the document (based on the `ownerKeyName` which by default is 'userId').
- `<Function>` When you pass a function Can will invoke it and return the result. The function will have the following parameters:
    - `<String>` or `<Object>` checkIdOrObject - the document id or the document itself that the action is being performed on (the type will depend on if you passed in the id or the document when calling the authorization method)
    - `<String>` checkInType - the itemName of the collection being checked in
    - `<String>` or `<Object> checkInIdOrObject - the document id or the document itself that the action is being validated in (the type will depend on if you passed in the id or the document when calling the authorization method)

### Collection level general
```javascript
Can.createPermissionsIn({
    action: <Boolean>, <String>, <Function> permission
}, <String> itemName);
```
### Global level role
```javascript
Can.createRole(<String> roleName, {
    action: <Boolean>, <String>, <Function> permission,
    itemName: <Object> of permissions or <Boolean>, <String>, <Function> permission
});
```
### Collection level role
```javascript
Can.createRoleIn(<String> roleName, {
    action: <Boolean>, <String>, <Function> permission,
    itemName: <Object> of permissions or <Boolean>, <String>, <Function> permission
}, <String> itemName);
```

## Checking permissions
```javascript
Can.create(<String> itemName, <Object> itemDoccument);
Can.view(<String> itemName, <String> itemId or <Object> itemDoccument);
Can.edit(<String> itemName, <String> itemId or <Object> itemDoccument);
Can.delete(<String> itemName, <String> itemId or <Object> itemDoccument);
```
### Checking document level permissions
```javascript
Can.createIn(<String> itemName, <Object> itemDoccument, <String> inItemName, <String> inItemId or <Object> inItemDoccument);
Can.viewIn(<String> itemName, <Object> itemDoccument, <String> inItemName, <String> inItemId or <Object> inItemDoccument);
Can.editIn(<String> itemName, <Object> itemDoccument, <String> inItemName, <String> inItemId or <Object> inItemDoccument);
Can.deleteIn(<String> itemName, <Object> itemDoccument, <String> inItemName, <String> inItemId or <Object> inItemDoccument);
```
### Custom permission types
```javascript
Can.addPermissionType(<String> permissionType);
```
## Setting custom document level permissions
### Role level
```javascript
Can.setPermissionForRoleIn(<String> permissionType, <Boolean> permissionValue, <String> roleName, <String> inName, <String> inId);
```
### User level
```javascript
Can.setPermissionForRoleIn(<String> permissionType, <Boolean> permissionValue, <String> userId, <String> inName, <String> inId);
```
