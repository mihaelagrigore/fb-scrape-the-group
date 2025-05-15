// ==UserScript==
// @name         Facebook Group Scraper by Adrian
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Scrapes posts and first-level comments from Facebook groups and exports to CSV
// @author       You
// @match        https://web.facebook.com/groups/laprimulbebe
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async function () {
  'use strict';

  console.log('***********************************');

  const allContent = [];

  function createCSV(data, fileName) {
    const headers = [
      'id',
      'email',
      'firstName',
      'lastName',
      'postId',
      'postText',
      'postAuthor',
      'postAuthorId',
      'postAuthorUrl',
      'commentId',
      'commentText',
      'commentAuthorName',
      'commentAuthorId',
      'commentAuthorUrl',
      'timestamp',
      'commentUrl',
    ];

    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            if (value === null) return 'null';
            if (typeof value === 'string') {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(blob, fileName);
    } else {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName || 'data.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  async function scrollDown() {
    const wrapper = window;
    await new Promise((resolve) => {
      var totalHeight = 0;
      var distance = 800;
      var timer = setInterval(() => {
        wrapper.scrollBy(0, distance);
        totalHeight += distance;
        clearInterval(timer);
        resolve();
      }, 400);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  function getEmailFromText(text) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const email = text?.match(emailRegex)?.[0];
    return email || '';
  }

  function clickOnComments(post) {
    var allDivs = post.getElementsByTagName('div');
    for (var i = 0; i < allDivs.length; i++) {
      if (allDivs[i].getAttribute('data-visualcompletion') === 'ignore-dynamic') {
        const thingToClickToOpenComments =
          allDivs?.[i]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]
            ?.children?.[0]?.children?.[1]?.children?.[1]?.children?.[0]
            ?.children?.[0];
        if (thingToClickToOpenComments) {
          thingToClickToOpenComments.click();
        }
      }
    }
  }

  function getAllPosts() {
    const posts = document.querySelectorAll('div[role=feed] > div');
    return [...posts].filter((post) => {
      const posterName = post?.querySelector('h2')?.textContent;
      return !!posterName;
    });
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function closeDialog() {
    const closeButton = document?.querySelector('div[aria-label="Close"]');
    if (closeButton) closeButton.click();
  }

  function formatTopLevelComments(postId, topLevelComments = []) {
    return topLevelComments.map((c) => {
      const text = c?.comment.body.text;
      const commentId = c?.comment.id;
      const authorName = c?.comment.author.name;
      const authorId = c?.comment.author.id;
      return {
        id: commentId,
        commentId,
        postId,
        commentText: text || '',
        commentAuthorName: authorName,
        commentAuthorId: authorId,
        commentAuthorUrl: '',
        timestamp: '',
        commentUrl: '',
        email: getEmailFromText(text),
        firstName: authorName?.split(' ')?.[0],
        lastName: authorName?.split(' ')?.[1],
      };
    });
  }

  function parseFirstLevelJson(json) {
    const actor =
      json?.data?.node?.group_feed?.edges?.[0]?.node?.comet_sections?.content
        ?.story?.comet_sections?.context_layout?.story?.comet_sections
        ?.actor_photo?.story?.actors?.[0];

    const postText =
      json?.data?.node?.group_feed?.edges?.[0]?.node?.comet_sections?.content
        ?.story?.comet_sections?.message_container?.story?.message?.text;
    const postId =
      json?.data?.node?.group_feed?.edges?.[0]?.node?.comet_sections?.feedback
        ?.story?.post_id;

    const post = {
      id: postId,
      postId,
      postText: postText || '',
      postAuthor: actor?.name,
      postAuthorId: actor?.id,
      postAuthorUrl: actor?.url,
      email: getEmailFromText(postText),
      firstName: actor?.name?.split(' ')?.[0],
      lastName: actor?.name?.split(' ')?.[1],
    };

    const topLevelComments = formatTopLevelComments(
      postId,
      json?.data?.node?.group_feed?.edges?.[0]?.node?.comet_sections?.feedback
        ?.story?.feedback_context?.interesting_top_level_comments,
    );
    return {
      post,
      topLevelComments,
    };
  }

  function parseSecondLevelJson(json) {
    const actor =
      json?.data?.node?.comet_sections?.content?.story?.comet_sections
        ?.context_layout?.story?.comet_sections?.actor_photo?.story?.actors?.[0];
    const postText =
      json?.data?.node?.comet_sections?.content?.story?.comet_sections
        ?.message_container?.story?.message?.text;
    const postId = json?.data?.node?.comet_sections?.feedback?.story?.post_id;

    const post = {
      id: postId,
      postId,
      postText: postText || '',
      postAuthor: actor?.name,
      postAuthorId: actor?.id,
      postAuthorUrl: actor?.url,
      email: getEmailFromText(postText),
      firstName: actor?.name?.split(' ')?.[0],
      lastName: actor?.name?.split(' ')?.[1],
    };

    const topLevelComments = formatTopLevelComments(
      postId,
      json?.data?.node?.comet_sections?.feedback?.story?.feedback_context
        ?.interesting_top_level_comments,
    );

    return {
      post,
      topLevelComments,
    };
  }

  function parseThirdLevelJson(json) {
    return parseSecondLevelJson(json); // Same structure
  }

  function addCommentsToAllContent(comments = []) {
    comments.forEach((c) => {
      if (!allContent?.find((f) => f.commentId === c.commentId)) {
        allContent.push(c);
      }
    });
  }

  function interceptRequests() {
    let oldXHROpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url, async) {
      if (!url.includes('graphql')) {
        return oldXHROpen.apply(this, arguments);
      }

      let requestBody = null;
      let oldXHRSend = this.send;
      this.send = function (data) {
        requestBody = data;
        oldXHRSend.apply(this, arguments);
      };

      this.addEventListener('load', function () {
        try {
          if (requestBody?.includes('GroupsCometFeedRegularStoriesPaginationQuery')) {
            debugger;
            const lines = this.responseText.split('\n');
            const data1 = JSON.parse(lines[0]);
            const firstPost = parseFirstLevelJson(data1);

            const data2 = JSON.parse(lines[1]);
            const secondPost = parseSecondLevelJson(data2);

            const data3 = JSON.parse(lines[2]);
            const thirdPost = parseThirdLevelJson(data3);

            allContent.push(firstPost.post);
            addCommentsToAllContent(firstPost.topLevelComments);
            allContent.push(secondPost.post);
            addCommentsToAllContent(secondPost.topLevelComments);
            allContent.push(thirdPost.post);
            addCommentsToAllContent(thirdPost.topLevelComments);
          } else if (requestBody?.includes('CometFocusedStoryViewUFIQuery')) {
            const data = JSON.parse(this.responseText);
            const postId = data?.data?.story_card?.post_id;
            const comments =
              data?.data?.feedback?.ufi_renderer?.feedback?.comment_list_renderer?.feedback?.comment_rendering_instance_for_feed_location?.comments?.edges?.map(
                (blah) => {
                  const comment = blah?.node;
                  const timeStuff = comment?.comment_action_links?.find(
                    (f) => f?.__typename === 'XFBCommentTimeStampActionLink',
                  )?.comment;
                  return {
                    id: comment?.id,
                    commentId: comment?.id,
                    postId,
                    commentText: comment?.body?.text,
                    commentAuthorName: comment?.author?.name,
                    commentAuthorId: comment?.author?.id,
                    commentAuthorUrl: comment?.author?.url,
                    timestamp: timeStuff?.created_time,
                    commentUrl: timeStuff?.url,
                    email: getEmailFromText(comment?.body?.text),
                    firstName: comment?.author?.name?.split(' ')?.[0],
                    lastName: comment?.author?.name?.split(' ')?.[1],
                  };
                },
              );
            addCommentsToAllContent(comments);
          }
        } catch (e) {
          console.error('Parsing failed:', e);
        }
      });

      return oldXHROpen.apply(this, arguments);
    };
  }

  async function run() {
    console.log('***********************************');
    interceptRequests();
    console.log('Starting Facebook scraper...');
    let posts = getAllPosts();
    let i = 0;

    while (i < posts.length) {
      const post = posts[i];
      clickOnComments(post);
      await sleep(1000);
      closeDialog();
      i++;
      if (scrolls > 0) {
        await scrollDown();
        scrolls--;
        posts = getAllPosts();
      }
    }

    createCSV(allContent, 'facebookGroupPostsAndComments.csv');
    console.log('Scraping complete!');
  }

  let scrolls = 50;
  await run();

})();
